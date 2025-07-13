# Changelog

All notable changes to the Character Manager project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-13

### Added
- Initial release of Character Manager
- Character creation and management system
- Avatar upload and management with automatic compression
- Custom parameter system (range sliders and checkboxes)
- Dynamic badge system with JavaScript conditions
- Inventory management with item moving capabilities
- Multiple view modes (Standard, Tile, Live)
- Import/Export functionality for JSON data
- Drag-and-drop character reordering
- Real-time summary statistics
- Auto-complete suggestions for items and parameters
- Mobile-responsive design
- Dark theme with DaisyUI components
- Multilingual support with Noto Sans Thai font
- Automatic localStorage persistence
- Character navigation menu
- Toast notifications for save confirmations

### Features
- **Character Types**: Standard characters with hunger/thirsty stats and non-characters
- **Custom Parameters**: Configurable range and checkbox parameters with color themes
- **Badge System**: Conditional badges based on character stats and properties
- **Inventory System**: Add, edit, move, and track items between characters
- **View Modes**: 
  - Standard mode for full character management
  - Tile mode for compact overview
  - Live mode for real-time updates and display
- **Data Management**: Complete import/export with JSON format
- **User Interface**: Modern, responsive design with accessibility features

### Technical Details
- Single HTML file architecture for easy deployment
- Vanilla JavaScript with no external dependencies (except SortableJS for drag-drop)
- TailwindCSS and DaisyUI for styling
- Browser localStorage for data persistence
- Mobile-optimized touch interactions

### Browser Support
- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

## [Planned] - Future Releases

### Under Consideration
- Multi-language interface localization
- Advanced badge condition editor
- Character templates and presets
- Bulk edit operations
- Data validation and error handling
- Export to additional formats (CSV, XML)
- Character relationship mapping
- Advanced statistics and charts
- Offline PWA capabilities
- Collaborative editing features

---

For more details about each release, see the [GitHub releases page](https://github.com/your-username/character-manager/releases).
