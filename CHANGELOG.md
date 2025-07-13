# Changelog
All notable changes to the Character Manager project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-07-13

###  Major Update: Complete Character Management Ecosystem

This release represents a complete transformation from a basic character manager to a comprehensive character management ecosystem with advanced inventory, item effects, and crafting systems.

###  Added - Item Encyclopedia System
- **Item Database**: Comprehensive item encyclopedia with descriptions, effects, and acquisition methods
- **Item Effects System**: Complex item effects that can modify character stats and custom parameters
- **Use Item Functionality**: Apply item effects to characters with automatic parameter creation
- **Item Search**: Advanced filtering by name, description, effects, or acquisition method
- **Smart Suggestions**: Auto-complete for items based on existing database
- **Item Wiki Priority**: Item encyclopedia serves as primary source for all item data

###  Added - Crafting System
- **Recipe Management**: Create and manage crafting recipes with materials and outputs
- **Bulk Crafting**: Craft multiple quantities at once with intelligent material validation
- **Material Validation**: Real-time checking of available materials vs. required materials
- **Crafting Preview**: Live preview showing materials needed and outputs received
- **Max Quantity Calculation**: Automatically determine maximum craftable amount
- **Recipe Search**: Filter recipes by name, materials, or outputs
- **Character Crafting**: Direct crafting from character cards with inventory integration

###  Added - Enhanced User Interface
- **Three-Tab Interface**: Separate tabs for Characters, Items, and Crafting management
- **Enhanced Modals**: Improved modal management with reliable closing mechanisms
- **Real-time Updates**: Live preview calculations and material validation
- **Enhanced Search**: Advanced filtering capabilities across all systems
- **Improved Navigation**: Seamless switching between management modes

###  Added - Technical Improvements
- **Modular Architecture**: Separate JavaScript managers for different functionalities:
  - character-manager.js: Core character management
  - item-manager.js: Item encyclopedia and effects system
  - crafting-manager.js: Recipe and crafting system
- **Startup Initialization**: All managers initialize at application load
- **Duplicate Prevention**: Protection against multiple manager initialization
- **Enhanced Data Integrity**: Validation and cleanup for all database systems
- **Centralized Suggestions**: Single source of truth for item auto-complete

###  Enhanced - Existing Features
- **Inventory System**: Enhanced with item encyclopedia integration
- **Character Management**: Integrated with crafting and item usage systems
- **Data Persistence**: Extended to support items database and crafting recipes
- **Auto-Parameter Creation**: Items can automatically create missing character parameters
- **Smart Tooltips**: Enhanced feedback and status messages

###  Fixed
- **Modal Closing**: Enhanced reliability for all modal interactions
- **Data Synchronization**: Improved consistency between different systems
- **Initialization Issues**: Crafting recipes now load before first use
- **Suggestion Updates**: Real-time updates when database changes

###  Changed
- **Data Priority**: Item Wiki now serves as primary source over character inventories
- **UI Organization**: Reorganized interface into logical tab sections
- **Performance**: Optimized initialization and data loading
- **User Flow**: Streamlined workflows for item usage and crafting

###  File Structure
`
Character Manager v2.0.0/
 characterNoto.html          # Main application (enhanced UI)
 character-manager.js        # Core character management
 item-manager.js            # Item encyclopedia & effects
 crafting-manager.js        # Crafting & recipe system
 README.md                  # Updated documentation
`

###  Data Format Updates
- **Item Database**: New localStorage key itemDatabase
- **Crafting Recipes**: New localStorage key craftingRecipes
- **Character Data**: Enhanced compatibility with new systems
- **Badge Data**: Maintained backward compatibility

###  AI Development Notice
This application was created with the assistance of AI technology, representing a collaborative approach to software development that combines human creativity with AI capabilities.

---

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

---

## Migration Guide: v1.0.0  v2.0.0

### Data Compatibility
- **Character Data**: Fully backward compatible
- **Badge Data**: Fully backward compatible
- **New Features**: Item database and crafting recipes are optional additions

### New Capabilities
1. **Item Encyclopedia**: Create items with complex effects in the Items tab
2. **Crafting System**: Design recipes and craft items in the Crafting tab
3. **Enhanced Item Usage**: Use items from encyclopedia on characters
4. **Bulk Operations**: Craft multiple quantities with material validation

### Recommended Upgrade Process
1. **Backup Data**: Export your existing character data
2. **Replace Files**: Update to new HTML and JavaScript files
3. **Gradual Migration**: Start adding items to the encyclopedia
4. **Create Recipes**: Design crafting recipes for your use case

---

For more details about each release, see the [GitHub releases page](https://github.com/pinsorn/CharacterNoto/releases).
