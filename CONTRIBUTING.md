# Contributing to Character Manager

Thank you for your interest in contributing to Character Manager! This document provides guidelines for contributing to the project.

## 🚀 Getting Started

### Prerequisites
- Modern web browser
- Basic knowledge of HTML, CSS, and JavaScript
- Text editor or IDE

### Development Setup
1. Fork the repository
2. Clone your fork locally
3. Open `characterNoto.html` in your browser
4. Make your changes
5. Test thoroughly
6. Submit a pull request

## 🔧 Development Guidelines

### Code Style
- **JavaScript**: Use vanilla JavaScript, no external frameworks
- **HTML**: Use semantic HTML5 elements
- **CSS**: Utilize TailwindCSS and DaisyUI classes when possible
- **Indentation**: Use 2 spaces for HTML/CSS, 2 spaces for JavaScript
- **Comments**: Add comments for complex logic and functions

### File Structure
```
character-manager/
├── characterNoto.html          # Main application file
├── README.md                   # Project documentation
├── CONTRIBUTING.md             # This file
├── LICENSE                     # MIT License
└── docs/                       # Additional documentation
    ├── API.md                  # API documentation
    ├── EXAMPLES.md             # Usage examples
    └── CHANGELOG.md            # Version history
```

## 🐛 Bug Reports

When reporting bugs, please include:
- Browser name and version
- Operating system
- Steps to reproduce the issue
- Expected behavior
- Actual behavior
- Screenshots if applicable
- Console error messages

Use this template:

```markdown
## Bug Description
Brief description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. Step three

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- Browser: Chrome 120.0
- OS: Windows 11
- Version: Latest

## Additional Information
Any other relevant information
```

## 💡 Feature Requests

For feature requests, please include:
- Clear description of the feature
- Use case or problem it solves
- Proposed implementation (if you have ideas)
- Mockups or examples (if applicable)

## 🔄 Pull Request Process

### Before Submitting
1. **Test thoroughly**: Ensure your changes work across different browsers
2. **Check existing issues**: Make sure you're not duplicating work
3. **Follow conventions**: Use existing code style and patterns
4. **Update documentation**: Update README.md if needed

### Pull Request Template
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested in Chrome
- [ ] Tested in Firefox
- [ ] Tested in Safari/Edge
- [ ] Mobile testing completed

## Checklist
- [ ] Code follows project conventions
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console errors
```

### Review Process
1. Automated checks (if any)
2. Manual review by maintainers
3. Testing in multiple browsers
4. Feedback and requested changes
5. Final approval and merge

## 🎯 Areas for Contribution

### High Priority
- **Browser compatibility**: Testing and fixes for different browsers
- **Performance optimization**: Improving load times and responsiveness
- **Accessibility**: ARIA labels, keyboard navigation, screen reader support
- **Mobile optimization**: Touch interactions and responsive design

### Medium Priority
- **New features**: Character templates, advanced statistics, relationships
- **UI improvements**: Better visual design, animations, transitions
- **Data management**: Advanced import/export options, data validation
- **Internationalization**: Multi-language support

### Low Priority
- **Code refactoring**: Improving code organization and maintainability
- **Documentation**: Additional examples, tutorials, API documentation
- **Testing**: Automated testing setup, edge case testing

## 🧪 Testing Guidelines

### Manual Testing Checklist
- [ ] Character creation and deletion
- [ ] Custom parameter management
- [ ] Item management and moving
- [ ] Badge creation and conditions
- [ ] Avatar upload and management
- [ ] Import/export functionality
- [ ] All view modes (standard, tile, live)
- [ ] Mobile responsiveness
- [ ] Data persistence across page reloads

### Browser Testing
Test your changes in:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

### Performance Testing
- Test with 50+ characters
- Test with large avatar images
- Test rapid UI interactions
- Monitor console for errors

## 📝 Documentation Standards

### Code Comments
```javascript
/**
 * Function description
 * @param {type} param - Parameter description
 * @returns {type} Return value description
 */
function exampleFunction(param) {
  // Implementation details
}
```

### README Updates
When adding features:
1. Update the features list
2. Add usage instructions
3. Update screenshots if needed
4. Add to the roadmap completion list

## 🏷️ Versioning

We use semantic versioning (SemVer):
- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): New features, backward compatible
- **Patch** (0.0.1): Bug fixes, backward compatible

## 🔒 Security

### Reporting Security Issues
Please report security vulnerabilities privately by emailing [maintainer email]. Do not use public issue tracker for security issues.

### Security Considerations
- Data is stored locally only
- No external API calls
- User-uploaded images are processed client-side
- JavaScript conditions in badges should be sanitized

## 🎉 Recognition

Contributors will be recognized in:
- README.md contributors section
- Release notes
- Special thanks in documentation

## 📞 Getting Help

If you need help with development:
1. Check existing documentation
2. Search closed issues and PRs
3. Open a discussion or issue
4. Ask specific questions with code examples

## 🚫 What We Don't Accept

- Contributions that break existing functionality
- Features that require external dependencies
- Changes without proper testing
- Code that doesn't follow project conventions
- Contributions without clear documentation

Thank you for contributing to Character Manager! 🎮
