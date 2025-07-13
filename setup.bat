@echo off
setlocal enabledelayedexpansion

rem Character Manager - GitHub Repository Setup Script
rem This script helps initialize a new GitHub repository for Character Manager

echo 🎮 Character Manager - GitHub Setup
echo ==================================
echo.

rem Check if git is installed
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Git is not installed. Please install Git first.
    echo    Download from: https://git-scm.com/downloads
    pause
    exit /b 1
)

echo ✅ Git is installed

rem Check if we're in the right directory
if not exist "characterNoto.html" (
    echo ❌ characterNoto.html not found in current directory
    echo    Please run this script from the character-manager-docs folder
    pause
    exit /b 1
)

echo ✅ Found characterNoto.html

rem Get GitHub username
echo.
set /p github_username="Enter your GitHub username: "

if "!github_username!"=="" (
    echo ❌ GitHub username is required
    pause
    exit /b 1
)

rem Get repository name (default: character-manager)
echo.
set /p repo_name="Enter repository name [character-manager]: "
if "!repo_name!"=="" set repo_name=character-manager

echo.
echo 📋 Setup Summary:
echo    GitHub Username: !github_username!
echo    Repository Name: !repo_name!
echo    Repository URL: https://github.com/!github_username!/!repo_name!
echo.
set /p confirm="Continue with setup? (y/n): "

if /i not "!confirm!"=="y" (
    echo Setup cancelled
    pause
    exit /b 0
)

echo.
echo 🚀 Initializing Git repository...

rem Initialize git repository
git init

rem Add all files
git add .

rem Create initial commit
git commit -m "Initial commit: Character Manager v1.0.0" -m "" -m "- Complete character management system" -m "- Avatar upload and management" -m "- Custom parameters and badge system" -m "- Inventory management with item moving" -m "- Import/export functionality" -m "- Multiple view modes" -m "- Mobile-responsive design" -m "- Comprehensive documentation"

rem Add remote origin
git remote add origin "https://github.com/!github_username!/!repo_name!.git"

echo.
echo ✅ Git repository initialized successfully!
echo.
echo 📝 Next Steps:
echo 1. Create a new repository on GitHub:
echo    - Go to: https://github.com/new
echo    - Repository name: !repo_name!
echo    - Description: A web-based character management system for RPGs, storytelling, and game development
echo    - Make it Public
echo    - DON'T initialize with README (we have our own)
echo.
echo 2. Push your code to GitHub:
echo    git branch -M main
echo    git push -u origin main
echo.
echo 3. Set up GitHub Pages (optional):
echo    - Go to repository Settings ^> Pages
echo    - Source: Deploy from branch ^> main
echo    - Your app will be available at:
echo      https://!github_username!.github.io/!repo_name!/characterNoto.html
echo.
echo 🎉 Happy coding! Your Character Manager is ready for GitHub!
echo.
pause
