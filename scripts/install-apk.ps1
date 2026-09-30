# Hardware IMS - ADB Install Script
# Run this script to force-install the APK via USB debugging
# Requirements: Android phone with USB Debugging enabled, connected via USB

$APK_PATH = $args[0]
$PACKAGE = "com.hardware.ims"

if (-not $APK_PATH) {
    # Try to find APK in Downloads folder
    $APK_PATH = Get-ChildItem "$env:USERPROFILE\Downloads" -Filter "*.apk" | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
    if (-not $APK_PATH) {
        Write-Host "Usage: .\install-apk.ps1 <path-to-apk>" -ForegroundColor Yellow
        Write-Host "Or place the APK in your Downloads folder and re-run." -ForegroundColor Yellow
        exit 1
    }
    Write-Host "Found APK: $APK_PATH" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Hardware IMS ADB Installer ===" -ForegroundColor Cyan
Write-Host ""

# Check adb is available
if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: 'adb' not found. Install Android Platform Tools:" -ForegroundColor Red
    Write-Host "  https://developer.android.com/tools/releases/platform-tools" -ForegroundColor Yellow
    exit 1
}

# Check device connected
$devices = adb devices | Select-String "device$"
if (-not $devices) {
    Write-Host "ERROR: No Android device detected." -ForegroundColor Red
    Write-Host "  1. Connect your phone via USB" -ForegroundColor Yellow
    Write-Host "  2. Enable Developer Options: Settings > About Phone > tap Build Number 7x" -ForegroundColor Yellow
    Write-Host "  3. Enable USB Debugging: Settings > Developer Options > USB Debugging" -ForegroundColor Yellow
    Write-Host "  4. Accept the 'Allow USB Debugging' prompt on your phone" -ForegroundColor Yellow
    exit 1
}

Write-Host "Device detected: $devices" -ForegroundColor Green

# Force uninstall existing version (ignore errors if not installed)
Write-Host ""
Write-Host "Uninstalling existing version..." -ForegroundColor Yellow
adb uninstall $PACKAGE 2>$null
Write-Host "Done." -ForegroundColor Green

# Install new APK
Write-Host ""
Write-Host "Installing APK: $APK_PATH" -ForegroundColor Yellow
$result = adb install -r "$APK_PATH"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "SUCCESS! Hardware IMS installed successfully." -ForegroundColor Green
    Write-Host "Open the app on your phone." -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "FAILED. ADB output: $result" -ForegroundColor Red
    Write-Host "Try: adb install -r -d `"$APK_PATH`"" -ForegroundColor Yellow
}
