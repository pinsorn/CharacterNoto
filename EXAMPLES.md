# Character Manager Examples

This document provides practical examples and use cases for the Character Manager application.

## 🎮 RPG Character Management

### Example 1: D&D 5e Character Tracking

#### Character Setup
```json
{
  "name": "Aria Moonwhisper",
  "hunger": 80,
  "thirsty": 60,
  "custom": {
    "Level": {
      "type": "range",
      "min": 1,
      "max": 20,
      "value": 5,
      "color": "primary"
    },
    "Hit Points": {
      "type": "range",
      "min": 0,
      "max": 45,
      "value": 32,
      "color": "success"
    },
    "Armor Class": {
      "type": "range",
      "min": 10,
      "max": 25,
      "value": 15,
      "color": "info"
    },
    "Inspiration": {
      "type": "checkbox",
      "value": true,
      "color": "accent"
    }
  },
  "items": [
    {"name": "Gold Pieces", "amount": 147},
    {"name": "Longsword +1", "amount": 1},
    {"name": "Healing Potion", "amount": 3},
    {"name": "Rations", "amount": 5}
  ]
}
```

#### Useful Badges
- **Injured**: `custom['Hit Points'].value < (custom['Hit Points'].max * 0.5)`
- **High Level**: `custom['Level'].value >= 10`
- **Well Equipped**: `items.find(i => i.name.includes('Potion')) && items.find(i => i.name.includes('Sword'))`

### Example 2: Cyberpunk Character

```json
{
  "name": "Rex Cybernetic",
  "custom": {
    "Street Cred": {
      "type": "range",
      "min": 0,
      "max": 50,
      "value": 23,
      "color": "accent"
    },
    "Cyberware Capacity": {
      "type": "range",
      "min": 0,
      "max": 100,
      "value": 67,
      "color": "warning"
    },
    "Corporate Fugitive": {
      "type": "checkbox",
      "value": true,
      "color": "error"
    }
  },
  "items": [
    {"name": "Eurodollars", "amount": 2340},
    {"name": "Militech M-10AF Lexington", "amount": 1},
    {"name": "Neural Processor", "amount": 1},
    {"name": "Trauma Kit", "amount": 2}
  ]
}
```

## 📚 Educational Use Cases

### Example 3: Literature Character Analysis

#### Character: Elizabeth Bennet (Pride and Prejudice)
```json
{
  "name": "Elizabeth Bennet",
  "custom": {
    "Intelligence": {
      "type": "range",
      "min": 0,
      "max": 10,
      "value": 9,
      "color": "primary"
    },
    "Social Status": {
      "type": "range",
      "min": 1,
      "max": 10,
      "value": 4,
      "color": "secondary"
    },
    "Prejudice Level": {
      "type": "range",
      "min": 0,
      "max": 10,
      "value": 7,
      "color": "warning"
    },
    "Married": {
      "type": "checkbox",
      "value": false,
      "color": "accent"
    }
  },
  "items": [
    {"name": "Letters from Darcy", "amount": 1},
    {"name": "Piano Skills", "amount": 1},
    {"name": "Walking Boots", "amount": 1}
  ]
}
```

#### Character Development Badges
- **Character Growth**: `custom['Prejudice Level'].value < 5`
- **Intellectual**: `custom['Intelligence'].value > 7`
- **Romantic Arc**: `custom['Married'].value === true`

## 🎯 Game Development

### Example 4: NPC Management System

#### Merchant Character
```json
{
  "name": "Grenda the Blacksmith",
  "custom": {
    "Reputation": {
      "type": "range",
      "min": 0,
      "max": 100,
      "value": 85,
      "color": "success"
    },
    "Shop Level": {
      "type": "range",
      "min": 1,
      "max": 5,
      "value": 3,
      "color": "primary"
    },
    "Currently Open": {
      "type": "checkbox",
      "value": true,
      "color": "info"
    },
    "Has Rare Items": {
      "type": "checkbox",
      "value": false,
      "color": "warning"
    }
  },
  "items": [
    {"name": "Iron Sword", "amount": 5},
    {"name": "Steel Armor", "amount": 3},
    {"name": "Repair Kits", "amount": 12},
    {"name": "Rare Ore", "amount": 2}
  ]
}
```

#### Quest Giver
```json
{
  "name": "Elder Sage Thornwick",
  "custom": {
    "Trust Level": {
      "type": "range",
      "min": 0,
      "max": 100,
      "value": 45,
      "color": "primary"
    },
    "Knowledge": {
      "type": "range",
      "min": 0,
      "max": 100,
      "value": 95,
      "color": "accent"
    },
    "Has Active Quest": {
      "type": "checkbox",
      "value": true,
      "color": "warning"
    }
  },
  "items": [
    {"name": "Ancient Scroll", "amount": 1},
    {"name": "Mystical Orb", "amount": 1},
    {"name": "Quest Reward Gold", "amount": 500}
  ]
}
```

## 🏢 Business/Organization Management

### Example 5: Team Member Tracking

```json
{
  "name": "Sarah Johnson - Project Lead",
  "custom": {
    "Experience Level": {
      "type": "range",
      "min": 1,
      "max": 10,
      "value": 8,
      "color": "primary"
    },
    "Current Workload": {
      "type": "range",
      "min": 0,
      "max": 100,
      "value": 75,
      "color": "warning"
    },
    "Available for New Projects": {
      "type": "checkbox",
      "value": false,
      "color": "error"
    },
    "Team Lead": {
      "type": "checkbox",
      "value": true,
      "color": "success"
    }
  },
  "items": [
    {"name": "Active Projects", "amount": 3},
    {"name": "Certifications", "amount": 5},
    {"name": "Team Members", "amount": 4}
  ]
}
```

## 🎭 Creative Writing

### Example 6: Novel Character Development

#### Protagonist
```json
{
  "name": "Maya Chen - Protagonist",
  "custom": {
    "Character Arc Progress": {
      "type": "range",
      "min": 0,
      "max": 100,
      "value": 35,
      "color": "primary"
    },
    "Emotional State": {
      "type": "range",
      "min": 0,
      "max": 10,
      "value": 6,
      "color": "info"
    },
    "Has Discovered Secret": {
      "type": "checkbox",
      "value": false,
      "color": "warning"
    },
    "Trusts Mentor": {
      "type": "checkbox",
      "value": true,
      "color": "success"
    }
  },
  "items": [
    {"name": "Mysterious Locket", "amount": 1},
    {"name": "Unread Letters", "amount": 7},
    {"name": "Allies", "amount": 2},
    {"name": "Secrets Learned", "amount": 3}
  ]
}
```

## 🎲 Complex Badge Examples

### Advanced Badge Conditions

#### RPG Status Effects
```javascript
// Low Health Warning
custom['Hit Points'].value < (custom['Hit Points'].max * 0.25)

// Overencumbered
items.reduce((total, item) => total + item.amount, 0) > 50

// High Level Character
custom['Level'].value >= 15 && custom['Experience'].value > 50000

// Combat Ready
items.find(item => item.name.toLowerCase().includes('weapon')) && 
items.find(item => item.name.toLowerCase().includes('armor'))

// Needs Rest
hunger < 30 || thirsty < 30 || custom['Fatigue'].value > 80
```

#### Story Development
```javascript
// Character Development Milestone
custom['Character Arc Progress'].value >= 50

// Relationship Status
custom['Romance Level'].value > 75 && custom['Trust Level'].value > 80

// Plot Device Holder
items.find(item => item.name.includes('Key') || item.name.includes('Map'))

// Antagonist Indicator
custom['Moral Alignment'].value < 20 && custom['Power Level'].value > 70
```

## 🔧 Advanced Techniques

### Dynamic Item Management

#### Inventory Templates
Create template characters with common item sets:

**Adventurer Starter Pack**:
- Backpack (1)
- Rope (50 feet)
- Torch (5)
- Rations (3 days)
- Water skin (1)
- Bedroll (1)
- Gold pieces (25)

### Bulk Operations Workflow

1. **Export** current data
2. **Edit** JSON file with text editor for bulk changes
3. **Import** modified data
4. **Verify** changes in application

### Character Relationship Tracking

Use custom parameters to track relationships:
```json
"custom": {
  "Relationship_John": {
    "type": "range",
    "min": -100,
    "max": 100,
    "value": 45,
    "color": "info"
  },
  "Trust_Sarah": {
    "type": "range", 
    "min": 0,
    "max": 100,
    "value": 78,
    "color": "success"
  }
}
```

## 📊 Data Analysis Examples

### Summary Statistics Usage

The built-in summary provides:
- Total character count
- Total item count across all characters
- List of all custom parameters in use
- Item distribution table

Use this data to:
- Balance game economies
- Track story progress
- Identify unused parameters
- Monitor character development

### Export Analysis

Export JSON data to analyze with external tools:
- Spreadsheet applications for statistical analysis
- Database tools for complex queries
- Programming languages for custom analysis
- Backup and version control systems

## 🎯 Pro Tips

### Efficient Workflows

1. **Use Suggestions**: The auto-complete system learns from your data
2. **Batch Similar Characters**: Create one, export, modify, import multiple
3. **Badge Validation**: Test badge conditions in browser console
4. **Mobile Friendly**: Design parameters for touch interaction
5. **Performance**: Keep character count under 100 for best performance

### Best Practices

1. **Consistent Naming**: Use consistent parameter and item names
2. **Meaningful Colors**: Assign colors that make sense (red for danger, green for health)
3. **Regular Backups**: Export data regularly
4. **Test Conditions**: Verify badge conditions work as expected
5. **Document Complex Logic**: Use parameter names that explain their purpose

This examples guide should help you get started with various use cases for the Character Manager. Feel free to adapt these examples to your specific needs!
