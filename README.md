# Character Manager
*This web application was created with the assistance of AI technology*

A comprehensive web-based character management system built with HTML, CSS (TailwindCSS + DaisyUI), and vanilla JavaScript. Perfect for tabletop RPGs, storytelling, game development, or any scenario where you need to track multiple characters with custom attributes, inventories, items, and crafting systems.

![Character Manager Preview](preview.png)

##  Features

### Core Character Management
- **Character Management**: Create, edit, and delete characters or non-character entities
- **Multilingual Support**: Built-in support for Thai and other non-English characters using Noto Sans Thai font
- **Avatar System**: Upload and manage character avatars with automatic compression
- **Custom Parameters**: Create custom attributes with range sliders or checkboxes
- **Badge System**: Dynamic badges with conditional logic based on character stats
- **Data Persistence**: Automatic saving to browser localStorage
- **Import/Export**: JSON-based data backup and sharing

###  Advanced Inventory & Item System
- **Item Encyclopedia**: Comprehensive database of items with descriptions, effects, and how-to-obtain information
- **Item Effects System**: Define complex item effects that modify character stats or custom parameters
- **Use Item Functionality**: Apply item effects to characters with automatic parameter creation
- **Inventory Management**: Add, edit, move, and track items with quantities between characters
- **Smart Item Suggestions**: Auto-complete based on existing item database
- **Item Search**: Filter items by name, description, effects, or how to obtain

###  Crafting System
- **Recipe Management**: Create and manage crafting recipes with materials and outputs
- **Bulk Crafting**: Craft multiple quantities at once with intelligent material validation
- **Material Validation**: Real-time checking of available materials vs. required materials
- **Crafting Preview**: See exactly what materials you need and what you'll receive
- **Max Quantity Calculation**: Automatically determine the maximum craftable amount
- **Recipe Search**: Filter recipes by name, materials, or outputs

### User Interface Features
- **Multiple View Modes**:
  - Standard card view
  - Tile mode for compact display
  - Live mode for real-time updates
- **Three-Tab Interface**:
  - Characters tab for character management
  - Items tab for item encyclopedia
  - Crafting tab for recipe management
- **Toggle Controls**:
  - Hide/show parameters
  - Hide/show items
  - Hide/show buttons (Live Mode)
- **Drag & Drop**: Reorder characters with intuitive drag-and-drop
- **Responsive Design**: Works on desktop and mobile devices
- **Dark Theme**: Modern dark theme with DaisyUI components

### Advanced Features
- **Smart Suggestions**: Auto-complete for items and parameters based on existing data
- **Statistics Summary**: Real-time summary of characters, items, and parameters
- **Character Navigation**: Floating menu for quick character navigation
- **Real-time Updates**: Live mode with automatic data synchronization
- **Modular Architecture**: Separate managers for characters, items, and crafting
- **Enhanced Modal Management**: Reliable modal closing and state management

##  Getting Started

### Prerequisites
- Modern web browser with JavaScript enabled
- No server setup required - runs entirely in the browser

### Installation
1. Download the characterNoto.html file and accompanying JavaScript files:
   - character-manager.js
   - item-manager.js
   - crafting-manager.js
2. Keep all files in the same directory
3. Open characterNoto.html in your web browser
4. Start creating characters!

### Quick Start
1. **Add Your First Character**:
   - Click "Add Character" to create a character with default hunger/thirsty stats
   - Or click "Add Non-Character" for entities without default stats

2. **Set Up Your Item Encyclopedia**:
   - Switch to the "Items" tab
   - Click "Add New Item" to create items with effects
   - Define how items affect character stats

3. **Create Crafting Recipes**:
   - Switch to the "Crafting" tab
   - Click "Add New Recipe" to create crafting recipes
   - Define required materials and output items

4. **Use the System**:
   - Use items on characters from the Items tab
   - Craft items from character cards using the "Craft" button
   - Manage inventories and track resources

##  Key Features Summary

###  Major Update - All Features Implemented
- [x] **Character Management**: Full CRUD operations with custom parameters
- [x] **Avatar System**: Image upload with automatic compression
- [x] **Badge System**: Conditional badges with JavaScript expressions
- [x] **Import/Export**: Complete data backup and sharing
- [x] **Item Encyclopedia**: Comprehensive item database with effects
- [x] **Item Effects System**: Complex stat and parameter modifications
- [x] **Use Item Functionality**: Apply items to characters with auto-parameter creation
- [x] **Crafting System**: Complete recipe management with materials and outputs
- [x] **Bulk Crafting**: Craft multiple quantities with material validation
- [x] **Smart Suggestions**: Auto-complete for all item and parameter inputs
- [x] **Search Functionality**: Filter items and recipes by multiple criteria
- [x] **Modular Architecture**: Separate managers for different functionalities
- [x] **Enhanced UI**: Three-tab interface with responsive design
- [x] **Real-time Validation**: Material checking and crafting previews
- [x] **Mobile Optimization**: Touch-friendly responsive interface
- [x] **Data Integrity**: Validation and duplicate prevention
- [x] **Live Mode**: Real-time updates for display scenarios

##  Technical Details

### Technologies Used
- **HTML5**: Semantic markup with modern standards
- **CSS**: Custom styles with responsive design
- **TailwindCSS**: Utility-first CSS framework
- **DaisyUI**: Component library for consistent UI
- **Vanilla JavaScript**: No external JavaScript dependencies
- **SortableJS**: Drag-and-drop functionality (CDN)
- **Google Fonts**: Noto Sans Thai for multilingual support

### Architecture
- **Modular Design**: Separate managers for different functionality
  - character-manager.js: Core character management
  - item-manager.js: Item encyclopedia and effects system
  - crafting-manager.js: Recipe and crafting system
- **Event-Driven**: Efficient update propagation between modules
- **State Management**: Centralized localStorage handling
- **Initialization Protection**: Prevents duplicate manager initialization

##  Use Cases

### Tabletop RPGs
- Track player characters and NPCs
- Manage complex inventories with item effects
- Create crafting systems for campaigns
- Monitor health, mana, or custom stats
- Track item usage and effects

### Game Development
- Character database for testing
- Item and crafting system prototyping
- Balance testing for resources and recipes
- NPC management during development
- Character progression visualization

### Storytelling
- Character development tracking
- Item significance and effects
- Resource management in stories
- World-building entity organization
- Plot device inventory

##  Privacy & Security

- **Local Storage Only**: All data stays in your browser
- **No Server Communication**: Completely offline after initial load
- **No Analytics**: No tracking or data collection
- **Secure by Design**: No external data transmission
- **AI-Generated**: Created with AI assistance for enhanced functionality

##  License

This project is open source and available under the MIT License.

##  Contributing

Contributions are welcome! Please feel free to submit issues, feature requests, or pull requests.

---

**Created with  and AI assistance for character management enthusiasts**

*This application leverages AI technology to provide a comprehensive, user-friendly character management experience with advanced inventory, crafting, and item systems.*
