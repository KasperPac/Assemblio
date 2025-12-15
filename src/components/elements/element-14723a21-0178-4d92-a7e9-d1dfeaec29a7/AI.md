---
name: ww-dropdown
description: A customizable dropdown menu component with configurable trigger types, positions, and alignments.
keywords: [dropdown, menu, trigger, position, alignment, animation]
---

#### ww-dropdown

***Purpose:***
Renders a dropdown menu that can be triggered by click, hover, or right-click, with configurable positions and alignments. The component supports animations and can be programmatically controlled.

***Properties:***
- triggerType: 'click'|'hover'|'right-click' - Type of interaction that opens the dropdown. Default: "click"
- position: 'top'|'right'|'bottom'|'left' - Position of dropdown relative to trigger. Default: "bottom"
- alignment: 'start'|'center'|'end' - Alignment along position axis. Default: "start"
- offsetX: string - Horizontal offset in px or %. Example: "10px" or "50%"
- offsetY: string - Vertical offset in px or %. Example: "8px" or "20%"
- dropdownZIndex: number - Z-index of dropdown (0-100). Supports states and classes
- disabled: boolean - Disables the dropdown functionality
- animated: boolean - Enables animations for dropdown transitions
- forceDisplayEditor: boolean - Forces display in editor mode

***Slots:***
- triggerLayout: (array of elements) - The element that triggers the dropdown. Example: ww-button
- dropdownLayout: (array of elements) - The content displayed in the dropdown. Example: ww-div with menu items

***Element Actions:***
- closeDropdown: (no args) Programmatically closes the dropdown

***Notes:***
- offsetX and offsetY support binding with string values (px or %)
- dropdownZIndex is responsive and supports states and classes
- alignment changes icon options based on position (horizontal/vertical alignment icons)
- disabled and animated properties can be bound to boolean values

***Example:***
<elements>
{"uid":"dropdown-element","tag":"ww-dropdown","props":{"default":{"offsetY":"8px","position":"bottom","alignment":"start","triggerType":"click","forceDisplayEditor":true}},"slots":{"triggerLayout":[{"uid":"dropdown-trigger-layout"}],"dropdownLayout":[{"uid":"dropdown-layout"}]}}
{"uid":"dropdown-trigger-layout","tag":"ww-button","props":{"default":{"disabled":false,"text":{"en":"Click me"}}},"styles":{"default":{"height":"38px","padding":"8px 16px","backgroundColor":"#000000","color":"#FFFFFF"}}}
{"uid":"dropdown-layout","tag":"ww-div","styles":{"default":{"width":"220px","padding":"8px","borderRadius":"12px"}},"slots":{"children":[{"uid":"dropdown-layout-children"}]}}
{"uid":"dropdown-layout-children","tag":"ww-div","slots":{"children":[{"uid":"layout-children-icon"},{"uid":"layout-children-text"}]}}
{"uid":"layout-children-icon","tag":"ww-icon","props":{"default":{"icon":"icon-user","fontSize":"16","color":"black"}}}
{"uid":"layout-children-text","tag":"ww-text","props":{"default":{"text":{"en":"Profile"}}}}
</elements>