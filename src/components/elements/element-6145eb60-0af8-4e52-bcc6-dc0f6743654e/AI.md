---
name: ww-input-select
description: A customizable dropdown select input field with search, infinite scroll, and custom styling features for selecting predefined options with text or custom layouts.
keywords: [select, combobox, selection, dropdown select, multi-select, multi selection, select items]
---

#### ww-input-select

**_Purpose:_**
A customizable select element that supports single and multiple selection with advanced features like search, infinite scroll, and extensive styling options.

**_Features:_**

-   Supports both single and multiple selection modes
-   Customizable search functionality with configurable search fields
-   Virtual scrolling always enabled for optimal performance, with two modes:
    -   Normal mode (default): DynamicScroller with automatic item size detection (easier to use)
    -   Heavy mode: RecycleScroller with fixed item sizes for optimal performance with 1000+ items
-   Extensive styling options for all components (trigger, dropdown, options, chips)
-   Multi-language support
-   Custom validation support
-   Configurable borders, colors, fonts, and spacing for all elements
-   Contain all logic for the select and all styling is done throught properties defined above.

**_Properties:_**

-   optionType: 'text'|'iconText'|'imageText' - Define how each option is displayed. Default: 'text'
-   choices: array<{ label: string, value: any }> - Array of objects (options) to display in the dropdown. Must be an array of objects, not primitive values. Example: [{"label": "Option 1", "value": "1"}]
-   mappingLabel: Formula - Formula to derive the label from each choice item (text only, no HTML). Example: {"js":"context.mapping?.['label']"}
-   mappingIcon: Formula - Formula to derive the icon from each choice item (iconText mode only). Example: {"js":"context.mapping?.['icon']"}
-   mappingImage: Formula - Formula to derive the image URL from each choice item (imageText mode only). Example: {"js":"context.mapping?.['image']"}
-   mappingValue: Formula - Formula to derive the value from each choice item. Example: {"js":"context.mapping?.['value']"}
-   mappingDisabled: Formula - Formula to disable/enable choice items. Example: {"js":"context.mapping?.['disabled']"}
-   initValueSingle: string|null - Initial value for single select mode. Default: null
-   initValueMulti: Array<string> - Initial values for multiple select mode. Default: []
-   selectType: 'single'|'multiple' - Type of selection. Default: 'single'
-   disabled: boolean - Whether the select is disabled. Default: false
-   required: boolean - Whether the select is required. Default: false
-   readonly: boolean - Whether the select is read-only. Default: false
-   forceOpenInEditor: boolean - Force the dropdown to stay open in the editor for easier design. Default: false (editor only)
-   initialState: 'closed'|'open' - Determines whether the dropdown starts in an open or closed state. Default: 'closed'
-   closeOnSelect: boolean - Whether to close dropdown after selection. Default: true
-   manualTrigger: boolean - Whether to disable automatic trigger opening. Default: false
-   closeOnClickOutside: boolean - Whether to close on outside click. Default: true
-   selectOnClick: boolean - Whether to select option on click. Default: true
-   unselectOnClick: boolean - Whether to unselect option on click. Default: false
-   showSearch: boolean - Whether to show search input. Default: false
-   searchBy: Array<object> - Properties to search by in options
-   autoFocus: boolean - Whether to focus search input on open. Default: true
-   showEmptyStateInEditor: boolean - Display the empty state message in the editor when no options are available. Default: false (editor only)
-   allowScrollingWhenOpen: boolean - Allow scrolling when dropdown is open. Default: false
-   virtualScrollBuffer: number - Buffer size (in pixels) for virtual scroll. This extends the viewport to render items outside the visible area. Virtual scrolling is always enabled. Default: 200
-   virtualScrollMinItemSize: number - Minimum item height (in pixels) for dynamic size detection. Only used when heavyMode is false. Default: 40
-   heavyMode: boolean - Enable heavy mode for better performance with very large lists (1000+ items). When enabled, uses RecycleScroller with fixed item sizes. When disabled (default), uses DynamicScroller with automatic size detection. Default: false
-   itemSize: number - Exact height (in pixels) of each option item. Required when heavyMode is true. All items must have the same height in heavy mode. Default: 40
-   placeholder: string|object - Placeholder text. Default: { en: 'Select a value' }
-   emptyStateText: string|object - Text to display when search returns no results. Default: { en: 'No results found' }
-   searchPlaceholder: string|object - Placeholder text for search input. Default: { en: 'Search' }
-   fieldName: string - Form field name. Default: ""
-   customValidation: boolean - Enable custom validation. Default: false
-   validation: Formula - Custom validation formula
-   limit: number - Maximum number of selectable items in multiple mode
-   zIndexOpen: number - Z-index of the dropdown when open. Default: 2
-   boundOffset: Length - Edge offset for dropdown positioning. Default: '0px'

-   selectedFontFamily: `string` - Font family of selected value. Default: `'inherit'`
-   selectedFontSize: `string` - Font size of selected value. Default: `'14px'`
-   selectedFontWeight: `number | null` - Font weight of selected value
-   selectedFontColor: `string` - Font color of selected value. Default: `'#333'`
-   selectedPadding: `string` - Padding of selected value. Default: `'0px'`
-   selectedTextAlign: `'left' | 'center' | 'right'` - Text alignment. Default: `'left'`

-   placeholderFontFamily: `string` - Font family of placeholder. Default: `'inherit'`
-   placeholderFontSize: `string` - Font size of placeholder. Default: `'14px'`
-   placeholderFontWeight: `number | null` - Font weight of placeholder
-   placeholderFontColor: `string` - Font color of placeholder. Default: `'#333'`
-   placeholderTextAlign: `'left' | 'center' | 'right'` - Text alignment. Default: `'left'`

-   chipFontSize: `string` - Font size of the chip text. Default: `"14px"`.
-   chipFontFamily: `string` - Font family of the chip text. Default: `"inherit"`.
-   chipFontWeight: `null | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900` - Font weight of the chip text. Default: `null`.
-   chipFontColor: `string` - Color of the chip text. Default: `"white"`.
-   chipPadding: `string` - Padding inside the chip. Default: `"2px 8px"`.
-   chipBgColor: `string` - Background color of the chip. Default: `"#363636"`.
-   chipBorder: `boolean` - Toggle between all borders or split borders. Default: `false`.
-   chipBorderAll: `string` - Border style when `chipBorder` is false.
-   chipBorderTop: `string` - Top border when `chipBorder` is true.
-   chipBorderRight: `string` - Right border when `chipBorder` is true.
-   chipBorderBottom: `string` - Bottom border when `chipBorder` is true.
-   chipBorderLeft: `string` - Left border when `chipBorder` is true.
-   chipBorderRadius: `string` - Border radius of the chip. Default: `"4px"`.
-   chipIconUnselect: `string` (optional) - Icon used for unselecting the chip. Displays a cross by default. (iconText mode only)
-   chipIconColor: `string` - Color of the chip icon. Default: `"white"`. (iconText mode only)
-   chipIconSize: `string` - Size of the chip icon. Default: `"14px"`. (iconText mode only)
-   chipImageSize: `string` - Size of the chip image. Default: `"14px"`. (imageText mode only)
-   chipImageRadius: `string` - Border radius of the chip image. Default: `"4px"`. (imageText mode only)

-   triggerHeight: `string` - Height of trigger
-   triggerBorder: `boolean` - When false, borders defined with triggerBorderAll, when true, use each triggerBorderTop..
-   triggerBorderAll: `Border` - All borders when not split
-   triggerBorderTop: `Border` - Top border when split
-   triggerBorderRight: `Border` - Right border when split
-   triggerBorderBottom: `Border` - Bottom border when split
-   triggerBorderLeft: `Border` - Left border when split
-   triggerBorderRadius: `string` - Border radius. Default: `'0px'`
-   triggerBgColor: `string` - Background color
-   triggerShadows: `string` - Box shadows. Default: `''`
-   triggerPadding: `string` - Padding. Default: `'0px'`
-   triggerMargin: `string` - Margin. Default: `'0px'`
-   triggerIconOpen: `string` (optional) - Icon when open. Displays a chevron up by default.
-   triggerIconClose: `string` (optional) - Icon when closed. Displays a chevron down by default.
-   triggerIconColor: `string` - Icon color. Default: `'black'`
-   triggerIconSize: `string` - Icon size. Default: `'16px'`
-   triggerImageSize: `string` - Size of trigger image. Default: `'16px'`
-   triggerImageRadius: `string` - Border radius of trigger image. Default: `'4px'`

-   dropdownWidth: `string` - Width of dropdown. Do not touch it if not necessary, default value compute the same width as trigger.
-   dropdownMaxHeight: `string` - Maximum height of dropdown
-   dropdownBorder: `boolean` - When false, borders defined with dropdownBorderAll, when true, use each borderLeft..
-   dropdownBorderAll: `Border` - All borders when not split
-   dropdownBorderTop: `Border` - Top border when split
-   dropdownBorderRight: `Border` - Right border when split
-   dropdownBorderBottom: `Border` - Bottom border when split
-   dropdownBorderLeft: `Border` - Left border when split
-   dropdownBorderRadius: `string` - Border radius. Default: `'0px'`
-   dropdownBgColor: `string` - Background color
-   dropdownShadows: `string` - Box shadows. Default: `''`
-   dropdownPadding: `string` - Padding. Default: `'0px'`
-   dropdownRowGap: `string` - Row gap. Default: `'0px'`
-   offsetX: Length - Horizontal offset of the dropdown relative to the trigger. Default: '0px'.
-   offsetY: Length - Vertical offset of the dropdown relative to the trigger. Default: '8px'.

-   optionFontSize: `string` - Font size. Default: `'14px'`
-   optionFontFamily: `string` - Font family. Default: `'inherit'`
-   optionFontWeight: `number | null` - Font weight
-   optionFontColor: `string` - Text color. Default: `'black'`
-   optionPadding: `string` - Padding. Default: `'0px'`
-   optionBorder: `string` - Border of the option. Default `'0px solid #000000'`
-   optionBorderRadius: `string` - Border radius. Default: `'0px'`
-   optionBgColor: `string` - Background color
-   optionBgColorFocused: `string` - Background color when focused. Default: `'#f5f5f5'`
-   optionBgColorHover: `string` - Background color on hover. Default: `'#f5f5f5'`
-   optionCursor: `string` - Cursor type. Default: `'pointer'`
-   optionIcon: `string` (optional) - Check icon. Displays a check by default. (iconText mode only)
-   optionIconColor: `string` - Icon color. Default: `'black'`. (iconText mode only)
-   optionIconSize: `string` - Icon size. Default: `'12px'`. (iconText mode only)
-   optionImageSize: `string` - Size of option image. Default: `'16px'`. (imageText mode only)
-   optionImageRadius: `string` - Border radius of option image. Default: `'4px'`. (imageText mode only)
-   optionSpacing: `string` - Spacing between options. Default: `'0px'`

-   emptyStateFontFamily: `string` - Font family. Default: `'inherit'`
-   emptyStateFontSize: `string` - Font size. Default: `'14px'`
-   emptyStateFontWeight: `number | null` - Font weight
-   emptyStateFontColor: `string` - Font color. Default: `'black'`
-   emptyStatePadding: `string` - Padding. Default: `'0px'`
-   emptyStateTextAlign: `'left' | 'center' | 'right'` - Text alignment. Default: `'left'`

-   searchWidth: `string` - Width of search input. Default: `'100%'`
-   searchHeight: `string` - Height of search input
-   searchBorder: `boolean` - When false, borders defined with searchBorderAll, when true, use each searchBorderTop..
-   searchBorderAll: `Border` - All borders when not split
-   searchBorderTop: `Border` - Top border when split
-   searchBorderRight: `Border` - Right border when split
-   searchBorderBottom: `Border` - Bottom border when split
-   searchBorderLeft: `Border` - Left border when split
-   searchBorderRadius: `string` - Border radius. Default: `'0px'`
-   searchPadding: `string` - Padding. Default: `'0px'`
-   searchMargin: `string` - Margin. Avoid horizontal margin as dropdown padding already give space between search and dropdown. Default: `'0px'`
-   searchOutline: `Border` - Outline style
-   searchOutlineOffset: `string` - Outline offset
-   searchFontFamily: `string` - Font family
-   searchFontSize: `string` - Font size
-   searchFontWeight: `number | null` - Font weight
-   searchFontColor: `string` - Font color. Default: `'black'`
-   searchBgColor: `string` - Background color. Default: `'white'`
-   searchPlaceholderColor: `string` - Placeholder color. Default: `'gray'`

Note: chip properties for multiselect, and selected properties for single select.

**_Settings:_**

-   dynamicConfiguration: object({"content":{"choices":[{"key":"nameOfKey","type"="typeOfKey"}]}}) - Object that describe format of data in choices

**_Exposed Variables:_**

-   value: any|array - Current selected value(s). Type depends on selectType (single/multiple). Access using variables['current_element_uid-value']

**_Events:_**

-   change: Triggered when selection changes. Payload: { value: any }
-   initValueChange: Triggered when initial value changes. Payload: { value: any }

**_Context:_**

-   context.local.data.select: { select: { options: array<{ label: Text, value: value (according to mappingValue), disabled: bool, isSelected: bool, \_data: rawData defined in choices }>, active: { value: variableValue (according to mappingValue), details: { value: variableValue (according to mappingValue), label: variableLabel (according to mappingLabel), disabled: bool, data: full selected data (dynamicConfiguration format) } }, utils: { type: selectType, isOpen, triggerHeight, triggerWidth } }, selectTrigger: { placeholder: Text } }

**_Example:_**

-   Simple select example

<elements>
{"uid":"select-car","tag":"ww-input-select","name":"Vehicle Multi Select","settings":{"dynamicConfiguration":{"content":{"choices":[{"key":"label","type":"Text"},{"key":"value","type":"Text"},{"key":"emoji","type":"Text"},{"key":"description","type":"Text"}]}}},"props":{"choices":[{"emoji":"🚗","label":"Sedan","value":"sedan","description":"Perfect for daily commuting"}],"selectType":"single","showSearch":true,"mappingLabel":{"js":"return context.mapping?.['emoji']+' '+context.mapping?.['label']",},"mappingValue":{"js":"return context.mapping?.['value']",}},"events":[{"trigger":"change","name":"Handle change","js":"console.log(event.value)","description":"..."}]}
</elements>

-   Multiselect example (changes from simple select)

<elements>
{"uid":"multi-select-car","tag":"ww-input-select","name":"Vehicle Multi Select",...,"props":{"chipFontColor":"#FFFFFF","chipBgColor":"#454545","chipPadding":"2px 6px","chipBorderRadius":"8px","chipIconUnselect":"lucide/x","chipIconSize":"12px","chipIconColor":"#FFFFFF","closeOnSelect":false,...}...}
</elements>

Important for multiselect : "triggerHeight" have to be "unset" to let the component calculate it with the number of chips.

-   Multi lang implementation

If user asks for multi lang support, you can use globalContext page lang and set :

-   choices: [{"emoji": "🇬🇧","value": "uk","label": {"en": "United Kingdom","fr": "Royaume uni"}},{"emoji": "🇨🇳","value": "ch","label": {"en": "China","fr":"Chine"}}]
-   dynamicConfiguration: {"content": {"choices": [{"key": "emoji","type": "Text"},{"key": "label","type": "RawObject"},{"key": "value","type": "Text"}]}}
-   mappingLabel: {"js": "return context.mapping?.['emoji']+ ' ' +context.mapping?.['label'] ?.[ globalContext.page?.['lang'] ]"}

**_Notes:_**

**CRITICAL** : If choices is an array of _objetcs_, you better use a specific field for mappingLabel and mappingValue like context.mapping?.['id'] etc. Do not use the whole context.mapping in this case.
**CRITICAL** : labels are always text, no img, no icons, no html etc. Do never attempts to return html in mappingLabel.
**CRITICAL** : You have to perfectly style this select according to the page.
**CRITICAL** : For multiselect, "triggerHeight" should be "unset" to let the component calculate it with the number of chips.

**Performance optimization** : Use heavy mode when dealing with 1000+ options for optimal performance. When heavy mode is enabled, you must specify the exact itemSize (height of each option in pixels) and ensure all options have the same height. For lists with dynamic heights or fewer items, keep heavy mode disabled to use automatic size detection.
