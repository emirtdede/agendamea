using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using System.Windows.Threading;
using Agendamea.Setup.Engine;
using Agendamea.Setup.Localization;
using Microsoft.Win32;

namespace Agendamea.Setup;

public partial class MainWindow : Window
{
    private readonly CliOptions _options;
    private readonly string _currentExePath;
    private readonly InstallEngine _engine = new();
    private readonly DispatcherTimer _backdropTimer;
    private readonly bool _reducedMotion;
    private readonly string _appVersion;
    private InstallerLocale _locale;
    private double _backdropPhase;
    private bool _isBusy;
    private bool _isOptionsOpen;
    private bool _uninstalledSuccessfully;
    private bool _isSuppressingLangEvent;
    private Storyboard? _shimmerStoryboard;

    public MainWindow(CliOptions options, InstallerLocale initialLocale, string currentExePath)
    {
        InitializeComponent();

        _options = options;
        _locale = initialLocale;
        _currentExePath = currentExePath;
        _reducedMotion = !SystemParameters.ClientAreaAnimation;
        var ver = typeof(MainWindow).Assembly.GetName().Version;
        _appVersion = ver is not null ? $"{ver.Major}.{ver.Minor}.{Math.Max(0, ver.Build)}" : "1.1.0";

        // Hydrate form fields
        InstallDirTextBox.Text = _options.InstallDir;
        DesktopShortcutCheck.IsChecked = _options.CreateDesktopShortcut;
        StartMenuShortcutCheck.IsChecked = _options.CreateStartMenuShortcut;
        StartupCheck.IsChecked = _options.LaunchAtStartup;
        CliPathCheck.IsChecked = _options.InstallCliPath;
        DeleteUserDataCheck.IsChecked = _options.DeleteUserData;
        UserDataPathText.Text = CliOptions.GetUserDataDir();

        var estBytes = SfxPayloadReader.EstimateInstalledSizeBytes(_currentExePath, _options.ExternalPayloadPath);
        DiskRequiredValueText.Text = FormatBytes(estBytes);

        // Populate all 73 languages
        _isSuppressingLangEvent = true;
        LanguageComboBox.ItemsSource = LocaleManager.All;
        LanguageComboBox.SelectedItem = _locale;
        _isSuppressingLangEvent = false;

        ApplyLocale(_locale);

        // 30 FPS gentle monochrome SoftBackdrop drift (disabled on Windows Reduced Motion)
        _backdropTimer = new DispatcherTimer(DispatcherPriority.Render)
        {
            Interval = TimeSpan.FromMilliseconds(33),
        };
        _backdropTimer.Tick += BackdropTimer_Tick;
        if (!_reducedMotion)
        {
            _backdropTimer.Start();
        }

        if (_options.Uninstall)
        {
            WelcomeView.Visibility = Visibility.Collapsed;
            WelcomeView.Opacity = 0;
            UninstallView.Visibility = Visibility.Visible;
            UninstallView.Opacity = 1;
        }
    }

    protected override void OnClosed(EventArgs e)
    {
        _backdropTimer.Stop();
        _shimmerStoryboard?.Stop();
        if (_uninstalledSuccessfully)
        {
            InstallEngine.ScheduleSelfCleanupIfNeeded(_options.InstallDir, _currentExePath);
        }
        base.OnClosed(e);
    }

    private void BackdropTimer_Tick(object? sender, EventArgs e)
    {
        _backdropPhase += 0.016;
        Canvas.SetLeft(Blob1, -70 + Math.Sin(_backdropPhase * 0.7) * 38);
        Canvas.SetTop(Blob1, -110 + Math.Cos(_backdropPhase * 0.55) * 26);

        Canvas.SetLeft(Blob2, 400 + Math.Cos(_backdropPhase * 0.6) * 34);
        Canvas.SetTop(Blob2, -70 + Math.Sin(_backdropPhase * 0.5) * 30);

        Canvas.SetLeft(Blob3, 160 + Math.Sin(_backdropPhase * 0.45 + 1.2) * 44);
        Canvas.SetTop(Blob3, 210 + Math.Cos(_backdropPhase * 0.65 + 0.8) * 24);
    }

    private void ApplyLocale(InstallerLocale loc)
    {
        _locale = loc;
        var flow = loc.IsRtl ? FlowDirection.RightToLeft : FlowDirection.LeftToRight;
        ContentHost.FlowDirection = flow;

        Title = _options.Uninstall ? loc.UninstallWindowTitle : loc.WindowTitle;
        TitleBarText.Text = Title;
        WelcomeTagline.Text = $"{loc.Tagline} (v{_appVersion})";
        PrimaryInstallButton.Content = loc.InstallButton;
        OpenOptionsText.Text = loc.OptionsButton;
        FooterText.Text = loc.FooterText;

        OptionsTitleText.Text = loc.OptionsTitle;
        CloseOptionsButton.ToolTip = loc.CloseOptionsTooltip;
        LanguageLabelText.Text = loc.LanguageLabel;
        InstallDirLabelText.Text = loc.InstallDirLabel;
        BrowseDirButton.Content = loc.BrowseButton;
        DesktopShortcutCheck.Content = loc.DesktopShortcutLabel;
        StartMenuShortcutCheck.Content = loc.StartMenuShortcutLabel;
        StartupCheck.Content = loc.LaunchAtStartupLabel;
        CliPathCheck.Content = loc.InstallCliLabel;
        DiskRequiredLabelText.Text = $"{loc.DiskRequiredLabel}:";
        SheetInstallButton.Content = loc.InstallButton;

        DoneTitleText.Text = loc.DoneTitle;
        DoneSubtitleText.Text = loc.DoneSubtitle;
        DoneCloseButton.Content = loc.CloseButton;
        DoneLaunchButton.Content = loc.LaunchButton;

        UninstallTitleText.Text = loc.UninstallTitle;
        UninstallSubtitleText.Text = loc.UninstallSubtitle;
        DeleteUserDataCheck.Content = loc.DeleteUserDataLabel;
        UninstallCancelButton.Content = loc.CancelButton;
        UninstallConfirmButton.Content = loc.UninstallButton;

        StatusRetryButton.Content = loc.RetryButton;
        StatusCloseButton.Content = loc.CloseButton;
    }

    private void TitleBar_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.LeftButton == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private void MinButton_Click(object sender, RoutedEventArgs e)
    {
        WindowState = WindowState.Minimized;
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        Close();
    }

    private void OpenOptionsButton_Click(object sender, RoutedEventArgs e)
    {
        SetOptionsSheetOpen(true);
    }

    private void CloseOptionsButton_Click(object sender, RoutedEventArgs e)
    {
        SetOptionsSheetOpen(false);
    }

    private void SetOptionsSheetOpen(bool open)
    {
        if (_isOptionsOpen == open) return;
        _isOptionsOpen = open;

        if (_reducedMotion)
        {
            OptionsSheet.Visibility = open ? Visibility.Visible : Visibility.Collapsed;
            OptionsSheetTransform.Y = open ? 0 : 380;
            return;
        }

        if (open)
        {
            OptionsSheet.Visibility = Visibility.Visible;
            var anim = new DoubleAnimation(380, 0, TimeSpan.FromMilliseconds(340))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
            };
            OptionsSheetTransform.BeginAnimation(TranslateTransform.YProperty, anim);
        }
        else
        {
            var anim = new DoubleAnimation(0, 380, TimeSpan.FromMilliseconds(280))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseIn },
            };
            anim.Completed += (_, _) =>
            {
                if (!_isOptionsOpen) OptionsSheet.Visibility = Visibility.Collapsed;
            };
            OptionsSheetTransform.BeginAnimation(TranslateTransform.YProperty, anim);
        }
    }

    private void LanguageComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_isSuppressingLangEvent) return;
        if (LanguageComboBox.SelectedItem is InstallerLocale selected)
        {
            ApplyLocale(selected);
        }
    }

    private void BrowseDirButton_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFolderDialog
        {
            Title = _locale.InstallDirLabel,
            InitialDirectory = System.IO.Directory.Exists(InstallDirTextBox.Text)
                ? InstallDirTextBox.Text
                : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        };
        if (dialog.ShowDialog(this) == true && !string.IsNullOrWhiteSpace(dialog.FolderName))
        {
            InstallDirTextBox.Text = dialog.FolderName;
        }
    }

    private async void InstallButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        _isBusy = true;
        CloseButton.IsEnabled = false;
        CloseButton.Visibility = Visibility.Collapsed;
        SetOptionsSheetOpen(false);

        _options.InstallDir = string.IsNullOrWhiteSpace(InstallDirTextBox.Text)
            ? CliOptions.GetDefaultInstallDir()
            : InstallDirTextBox.Text.Trim();
        _options.CreateDesktopShortcut = DesktopShortcutCheck.IsChecked == true;
        _options.CreateStartMenuShortcut = StartMenuShortcutCheck.IsChecked == true;
        _options.LaunchAtStartup = StartupCheck.IsChecked == true;
        _options.InstallCliPath = CliPathCheck.IsChecked == true;

        SwitchView(WelcomeView, ProgressView);
        StartShimmer();

        var progress = new Progress<ProgressUpdate>(u =>
        {
            ProgressStepText.Text = u.StepLabel;
            var clamped = Math.Clamp(u.Percent, 0, 100);
            ProgressPercentText.Text = $"{Math.Round(clamped)}%";
            ShimmerFillHost.Width = ShimmerTrack.ActualWidth * (clamped / 100.0);
        });

        try
        {
            await _engine.InstallAsync(_options, _locale, _currentExePath, progress);
            StopShimmer();
            DoneSubtitleText.Text = _locale.DoneSubtitle;
            SwitchView(ProgressView, DoneView);
            PlayCheckBurst(DoneBurstRing, DoneBurstScale, DoneCheckScale);
        }
        catch (Exception ex)
        {
            StopShimmer();
            ShowError(ex.Message);
            SwitchView(ProgressView, StatusDoneView);
        }
        finally
        {
            _isBusy = false;
            CloseButton.IsEnabled = true;
            CloseButton.Visibility = Visibility.Visible;
        }
    }

    private async void ConfirmUninstallButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isBusy) return;
        _isBusy = true;
        CloseButton.IsEnabled = false;
        CloseButton.Visibility = Visibility.Collapsed;
        _options.DeleteUserData = DeleteUserDataCheck.IsChecked == true;

        SwitchView(UninstallView, ProgressView);
        StartShimmer();

        var progress = new Progress<ProgressUpdate>(u =>
        {
            ProgressStepText.Text = u.StepLabel;
            var clamped = Math.Clamp(u.Percent, 0, 100);
            ProgressPercentText.Text = $"{Math.Round(clamped)}%";
            ShimmerFillHost.Width = ShimmerTrack.ActualWidth * (clamped / 100.0);
        });

        try
        {
            await _engine.UninstallAsync(_options, _locale, _currentExePath, progress);
            StopShimmer();
            _uninstalledSuccessfully = true;
            StatusCircle.Background = new SolidColorBrush(Color.FromRgb(250, 250, 250));
            StatusGlyphPath.Data = Geometry.Parse("M 21,37 L 31,47 L 51,26");
            StatusGlyphPath.Stroke = new SolidColorBrush(Color.FromRgb(17, 17, 19));
            StatusTitleText.Text = _locale.UninstalledTitle;
            StatusSubtitleText.TextAlignment = TextAlignment.Center;
            StatusSubtitleText.Text = _locale.UninstalledSubtitle;
            StatusRetryButton.Visibility = Visibility.Collapsed;
            SwitchView(ProgressView, StatusDoneView);
            PlayCheckBurst(StatusBurstRing, StatusBurstScale, null);
        }
        catch (Exception ex)
        {
            StopShimmer();
            ShowError(ex.Message);
            SwitchView(ProgressView, StatusDoneView);
        }
        finally
        {
            _isBusy = false;
            CloseButton.IsEnabled = true;
            CloseButton.Visibility = Visibility.Visible;
        }
    }

    private void ShowError(string message)
    {
        StatusCircle.Background = new SolidColorBrush(Color.FromRgb(220, 38, 38));
        StatusGlyphPath.Data = Geometry.Parse("M 24,24 L 48,48 M 48,24 L 24,48");
        StatusGlyphPath.Stroke = new SolidColorBrush(Color.FromRgb(250, 250, 250));
        StatusTitleText.Text = _locale.ErrorTitle;
        StatusSubtitleText.TextAlignment = message.Length > 140 ? TextAlignment.Left : TextAlignment.Center;
        StatusSubtitleText.Text = message;
        StatusRetryButton.Visibility = Visibility.Visible;
    }

    private void RetryButton_Click(object sender, RoutedEventArgs e)
    {
        SwitchView(StatusDoneView, _options.Uninstall ? UninstallView : WelcomeView);
    }

    private void LaunchAndCloseButton_Click(object sender, RoutedEventArgs e)
    {
        InstallEngine.LaunchInstalledApp(_options.InstallDir);
        Close();
    }

    private void SwitchView(UIElement from, UIElement to)
    {
        if (_reducedMotion)
        {
            from.Visibility = Visibility.Collapsed;
            from.Opacity = 0;
            to.Visibility = Visibility.Visible;
            to.Opacity = 1;
            return;
        }

        to.Visibility = Visibility.Visible;
        to.Opacity = 0;

        var fadeOut = new DoubleAnimation(1, 0, TimeSpan.FromMilliseconds(160))
        {
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        fadeOut.Completed += (_, _) => from.Visibility = Visibility.Collapsed;
        from.BeginAnimation(OpacityProperty, fadeOut);

        var fadeIn = new DoubleAnimation(0, 1, TimeSpan.FromMilliseconds(240))
        {
            BeginTime = TimeSpan.FromMilliseconds(80),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        to.BeginAnimation(OpacityProperty, fadeIn);
    }

    private void StartShimmer()
    {
        if (_reducedMotion) return;
        _shimmerStoryboard?.Stop();
        var anim = new DoubleAnimation(-120, 480, TimeSpan.FromMilliseconds(1250))
        {
            RepeatBehavior = RepeatBehavior.Forever,
        };
        Storyboard.SetTarget(anim, ShimmerTransform);
        Storyboard.SetTargetProperty(anim, new PropertyPath(TranslateTransform.XProperty));
        _shimmerStoryboard = new Storyboard();
        _shimmerStoryboard.Children.Add(anim);
        _shimmerStoryboard.Begin();
    }

    private void StopShimmer()
    {
        _shimmerStoryboard?.Stop();
    }

    private void PlayCheckBurst(UIElement ring, ScaleTransform ringScale, ScaleTransform? circleScale)
    {
        if (_reducedMotion)
        {
            if (circleScale is not null)
            {
                circleScale.ScaleX = 1;
                circleScale.ScaleY = 1;
            }
            return;
        }

        var ringAnimX = new DoubleAnimation(0.7, 1.38, TimeSpan.FromMilliseconds(620))
        {
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        var ringAnimY = new DoubleAnimation(0.7, 1.38, TimeSpan.FromMilliseconds(620))
        {
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut },
        };
        var ringOpacity = new DoubleAnimationUsingKeyFrames();
        ringOpacity.KeyFrames.Add(new LinearDoubleKeyFrame(0.85, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(90))));
        ringOpacity.KeyFrames.Add(new LinearDoubleKeyFrame(0.0, KeyTime.FromTimeSpan(TimeSpan.FromMilliseconds(620))));

        ringScale.BeginAnimation(ScaleTransform.ScaleXProperty, ringAnimX);
        ringScale.BeginAnimation(ScaleTransform.ScaleYProperty, ringAnimY);
        ring.BeginAnimation(OpacityProperty, ringOpacity);

        if (circleScale is not null)
        {
            var popX = new DoubleAnimation(0.75, 1.0, TimeSpan.FromMilliseconds(380))
            {
                EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.5 },
            };
            var popY = new DoubleAnimation(0.75, 1.0, TimeSpan.FromMilliseconds(380))
            {
                EasingFunction = new BackEase { EasingMode = EasingMode.EaseOut, Amplitude = 0.5 },
            };
            circleScale.BeginAnimation(ScaleTransform.ScaleXProperty, popX);
            circleScale.BeginAnimation(ScaleTransform.ScaleYProperty, popY);
        }
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes >= 1024L * 1024L * 1024L)
        {
            return $"~{bytes / (1024.0 * 1024.0 * 1024.0):F2} GB";
        }
        return $"~{Math.Max(1, Math.Round(bytes / (1024.0 * 1024.0)))} MB";
    }
}
