#!/bin/bash

# Character Manager - GitHub Repository Setup Script
# This script helps initialize a new GitHub repository for Character Manager

echo "🎮 Character Manager - GitHub Setup"
echo "=================================="
echo ""

# Check if git is installed
if ! command -v git &> /dev/null; then
    echo "❌ Git is not installed. Please install Git first."
    echo "   Download from: https://git-scm.com/downloads"
    exit 1
fi

echo "✅ Git is installed"

# Check if we're in the right directory
if [ ! -f "characterNoto.html" ]; then
    echo "❌ characterNoto.html not found in current directory"
    echo "   Please run this script from the character-manager-docs folder"
    exit 1
fi

echo "✅ Found characterNoto.html"

# Get GitHub username
echo ""
read -p "Enter your GitHub username: " github_username

if [ -z "$github_username" ]; then
    echo "❌ GitHub username is required"
    exit 1
fi

# Get repository name (default: character-manager)
echo ""
read -p "Enter repository name [character-manager]: " repo_name
repo_name=${repo_name:-character-manager}

echo ""
echo "📋 Setup Summary:"
echo "   GitHub Username: $github_username"
echo "   Repository Name: $repo_name"
echo "   Repository URL: https://github.com/$github_username/$repo_name"
echo ""
read -p "Continue with setup? (y/n): " confirm

if [[ $confirm != [yY] ]]; then
    echo "Setup cancelled"
    exit 0
fi

echo ""
echo "🚀 Initializing Git repository..."

# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Character Manager v1.0.0

- Complete character management system
- Avatar upload and management  
- Custom parameters and badge system
- Inventory management with item moving
- Import/export functionality
- Multiple view modes
- Mobile-responsive design
- Comprehensive documentation"

# Add remote origin
git remote add origin "https://github.com/$github_username/$repo_name.git"

echo ""
echo "✅ Git repository initialized successfully!"
echo ""
echo "📝 Next Steps:"
echo "1. Create a new repository on GitHub:"
echo "   - Go to: https://github.com/new"
echo "   - Repository name: $repo_name"
echo "   - Description: A web-based character management system for RPGs, storytelling, and game development"
echo "   - Make it Public"
echo "   - DON'T initialize with README (we have our own)"
echo ""
echo "2. Push your code to GitHub:"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "3. Set up GitHub Pages (optional):"
echo "   - Go to repository Settings > Pages"
echo "   - Source: Deploy from branch > main"
echo "   - Your app will be available at:"
echo "     https://$github_username.github.io/$repo_name/characterNoto.html"
echo ""
echo "🎉 Happy coding! Your Character Manager is ready for GitHub!"
