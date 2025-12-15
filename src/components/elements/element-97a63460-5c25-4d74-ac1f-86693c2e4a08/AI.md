---
name: ww-checkbox
description: A visual checkbox icon component that displays a check mark. Must be used within ww-input-checkbox for proper functionality
keywords: [checkbox, check, icon, form, input, selection]
---

#### ww-checkbox

***Purpose:***
Displays a customizable checkbox icon that serves as the visual representation for checkbox inputs. This component provides the check mark icon and visual states for checkbox functionality. It automatically receives state information from its parent ww-input-checkbox component.

***Properties:***
- icon: string - The icon to display. Default: 'lucide/check'
- color: string - The color of the ICON ONLY (not background). Default: #00000000 (transparent)

***Events:***
None

***States:***
- checked: Automatically synced with parent checkbox state
- readonly: Automatically synced with parent readonly state

***Exposed Element Actions:***
None

***Notes:***
- Must be used within a ww-input-checkbox component for proper checkbox functionality
- Size is controlled by setting width and height styles on the component (not fontSize)
- Icon visibility is controlled automatically using opacity (0 when unchecked, 1 when checked)
- Shows a placeholder check icon in editor mode when no icon is set
- The component emits its own checked and readonly states based on parent state
- Use the component's own states for styling instead of parent states

**IMPORTANT STYLING INSTRUCTIONS:**
- ALWAYS include the "checked" state in the states array: `"states":[{"id":"checked","label":"checked"}]`
- ALWAYS use state-based props for ICON color: `"props":{"default":{"color":"#00000000"},"checked_default":{"color":"#FFFFFF"}}`
- The color property ONLY affects the icon/checkmark color, NOT the background
- Default icon color should be transparent (#00000000) to hide the checkmark when unchecked
- Checked state icon color should contrast with background (e.g., white #FFFFFF on colored background)
- Background styling (backgroundColor, border) should be in styles, NOT affected by the color prop
- DO NOT set icon color the same as background color - the icon needs to be visible when checked

***Example:***
<elements>
{"uid":0,"tag":"ww-checkbox","name":"Checkbox Icon","props":{"default":{"icon":"lucide/check","color":"#00000000"},"checked_default":{"color":"#0A89FF"}},"states":[{"id":"checked","label":"checked"}],"styles":{"default":{"width":"24px","height":"24px"}}}
</elements>

**Note:** This component should ONLY be used within the checkbox slot of ww-input-checkbox. The parent component handles all state management and interactivity. The example shows how to use the checked state to change the icon color when checked.
