---
name: ww-input-checkbox
description: A fully functional checkbox input component for forms that requires the ww-checkbox component for visual representation
keywords: [checkbox, input, form, selection, toggle, boolean]
---

#### ww-input-checkbox

***Purpose:***
Provides a complete checkbox input implementation with form integration, state management, and accessibility support. This component uses ww-checkbox for the visual representation while handling all input logic and form submission.

***Features:***
- Full form integration with validation support
- Accessibility-compliant with native checkbox input
- Customizable container for labels or additional content
- Two-way data binding with real-time updates
- Support for custom validation formulas

***Properties:***
- value: boolean - The initial value of the checkbox. Default: false
- required: boolean - Whether the checkbox is required. Default: false
- readonly: boolean - Whether the checkbox is read-only. Default: false
- fieldName: string - The field name for form submission. Default: ''
- customValidation: boolean - Whether to use custom validation. Default: false
- validation: Formula - Custom validation formula to apply when customValidation is true. Default: ''
- isEmbeddedContainer: boolean - Whether to show an embedded container for additional content. Default: false
- containerPosition: 'right'|'left'|'top'|'bottom' - Position of the embedded container relative to the checkbox. Default: 'right'

***Slots:***
- checkbox: (element) ww-checkbox - **REQUIRED: Must contain ONLY a ww-checkbox component**. DO NOT use ww-div, ww-icon, or any other component here. The ww-checkbox handles all visual representation including the icon, checked state, and styling
- embeddedContainer: (element) ww-div - Container for labels, text, or additional content. Use this slot for any text labels or descriptions. Hidden when isEmbeddedContainer is false

***Exposed Variables:***
- value: ***READ/WRITE*** The current checkbox value. (path: variables['current_element_uid-value'])

***Events:***
- change: Triggered when the checkbox value changes. Payload: { "domEvent": Event, "value": boolean }
- initValueChange: Triggered when the initial value changes. Payload: { "value": boolean }

***States:***
- checked: Automatically added when checkbox is checked, removed when unchecked
- readonly: Automatically added when readonly is true, removed when false

***Exposed Element Actions:***
None

***Notes:***
- Uses a hidden native HTML checkbox input for accessibility
- Visual representation provided by the ww-checkbox component
- Integrates with WeWeb forms when placed inside a form container
- States 'checked' and 'readonly' are automatically applied based on value and readonly properties

**IMPORTANT USAGE INSTRUCTIONS:**
- The checkbox slot MUST contain a ww-checkbox component - DO NOT create custom checkbox visuals with ww-div
- For checkbox labels or text, use the embeddedContainer slot - DO NOT place text in the checkbox slot
- The ww-checkbox component automatically handles icon display, states, and transitions
- DO NOT manually manage icon visibility or checkbox states with conditions

**CRITICAL CHECKBOX STYLING REQUIREMENTS:**
When creating the ww-checkbox child element:
- MUST include the "checked" state: `"states":[{"id":"checked","label":"checked"}]`
- MUST use state-based color in props for ICON COLOR: `"props":{"default":{"color":"#00000000"},"checked_default":{"color":"#FFFFFF"}}`
- The color property ONLY controls the checkmark/icon color, NOT the background
- Default icon color should be transparent (#00000000) to hide the checkmark when unchecked
- Checked state icon color MUST contrast with background (e.g., white #FFFFFF on blue background)
- Background styling (backgroundColor, border) goes in styles section, separate from icon color
- NEVER set icon color the same as background color - the checkmark must be visible

***Example:***
<elements>
{"uid":0,"tag":"ww-form-container","name":"Terms Agreement Form","props":{"default":{"validation":"submit","autocomplete":true,"debounceDelay":"500ms"}},"styles":{"default":{"display":"flex","rowGap":"16px"}},"slots":{"formContent":[{"uid":1}]}}
{"uid":1,"tag":"ww-input-checkbox","name":"Terms Agreement Checkbox","props":{"default":{"value":false,"readonly":false,"required":true,"fieldName":"terms_accepted","validation":"","customValidation":false,"containerPosition":"right","isEmbeddedContainer":true}},"styles":{"default":{"cursor":"pointer","display":"flex","alignItems":"center"}},"slots":{"checkbox":{"uid":2},"embeddedContainer":{"uid":3}}}
{"uid":2,"tag":"ww-checkbox","name":"Checkbox Icon","props":{"default":{"icon":"lucide/check","color":"#00000000"},"checked_default":{"color":"#FFFFFF"}},"states":[{"id":"checked","label":"checked"}],"styles":{"default":{"width":"20px","height":"20px","backgroundColor":"#FFFFFF","border":"2px solid #d1d5db","borderRadius":"4px"},"checked_default":{"backgroundColor":"#3b82f6","borderColor":"#3b82f6"}}}
{"uid":3,"tag":"ww-div","name":"Checkbox Label Container","styles":{"default":{"cursor":"pointer","display":"flex","padding":"0 0 0 12px","alignItems":"center"}},"slots":{"children":[{"uid":4}]}}
{"uid":4,"tag":"ww-text","name":"Terms Agreement Text","props":{"default":{"tag":"p","text":{"en":"I agree to the terms and conditions"}}},"styles":{"default":{"cursor":"pointer","color":"#2a2f34","fontSize":"14px","fontFamily":"sans-serif","lineHeight":"1.5"}}}
</elements>