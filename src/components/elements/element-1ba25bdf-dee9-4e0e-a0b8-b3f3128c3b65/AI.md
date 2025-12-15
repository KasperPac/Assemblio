---
name: ww-input-toggle
description: The `ww-input-toggle` component provides a user-friendly toggle switch for enabling or disabling settings, featuring customizable colors and sizes, with events triggered on value changes.
keywords: toggle switch, boolean value, read-only toggle, required input, selector size, selector color, background color, change event, initvaluechange event, user interface component
---

#### ww-input-toggle

***Purpose:***
Renders a toggle switch for enabling/disabling options with click/tap interaction.

***Properties:***
- value: boolean - Initial toggle state. Default: false
- required: boolean - Input requirement. Default: true
- readonly: boolean - Read-only state. Default: false
- selectorSize: string - Height selector size percentage. Average: 60%. Mandatory
- selectorColorOff: string|null - Off state selector color. Default: null. Mandatory
- selectorColorOn: string|null - On state selector color. Default: null. Mandatory
- backgroundColorOff: string|null - Off state background color. Default: null. Mandatory
- backgroundColorOn: string|null - On state background color. Default: null. Mandatory
- fieldName: string - Form field name for identification. Default: ""
- customValidation: boolean - Enable custom validation. Default: false
- validation: Formula - Custom validation formula. Requires customValidation to be true!

***Exposed Variables:***
- value: boolean - Current toggle state. (path: variables['current_element_uid-value'])

***Events:***
- change: Triggered when toggle value changes. Payload: {value: boolean, domEvent: Event}
- initValueChange: Triggered when initial value changes. Payload: {value: boolean}

***Notes:***
- Do not forget to add the necessary border radius to have a good looking toggle element.
- Do not forget to add colors to the toggle or else it will be transparent and the user will not see it.
