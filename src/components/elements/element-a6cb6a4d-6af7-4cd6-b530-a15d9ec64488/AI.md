---
name: ww-tabs
description: Tabs component for switching between content areas with customizable positions, alignments, and transitions.
keywords: [tabs, navigation, ui, content, switcher, responsive]
---

#### ww-tabs

***Purpose:***
Interactive tabs component that enables users to switch between different content areas. Each tab consists of a header (clickable) and corresponding content area. Supports custom positioning, transitions, and responsive design.

***Features:***
- Tab reordering with up/down arrows in editor (when orderable is enabled)
- Custom tab labels with double-click editing in editor
- Multiple tab positions (top, bottom, left, right)
- Customizable transition effects between tabs
- Responsive alignment options
- Backward compatibility with existing tab configurations

***Properties:***
- tabsPosition: 'top'|'bottom'|'left'|'right' - Position of tabs relative to content. Default: 'top'
- horizontalAlignment: 'flex-start'|'center'|'flex-end'|'space-around'|'space-between'|'start'|'end' - Horizontal alignment. Default: 'center'
- verticalAlignment: 'start'|'center'|'end'|'flex-start'|'flex-end'|'space-around'|'space-between' - Vertical alignment. Default: 'center'
- transition: 'none'|'fade'|'fadeTopBottom'|'fadeLeftRight' - Transition effect between tabs. Default: 'fade'
- transitionDuration: number - Transition duration in seconds (0-5). Default: 0.4
- value: number - Active tab index (0-based)
- tabLabels: string[] - Array of custom tab labels (e.g. ["Users", "Settings", "Profile"]). Falls back to default "Tab 0", "Tab 1" etc. when not set

***Slots:***
- tabsList: (array of arrays) - Components for tab headers. Each sub-array represents one tab's header content
- tabsContent: (array of arrays) - Components for tab content areas. Each sub-array represents one tab's content

***Context data (only accessible to this element and its children):***
- context.local.data?.['tab']?.['tabIndex'] - Current tab index (0-based)
- context.local.data?.['tab']?.['tabLabel'] - Current tab label
- context.local.data?.['tab']?.['isActive'] - Whether the current tab is active
- context.local.data?.['tab']?.['totalTabs'] - Total number of tabs
- context.local.data?.['tab']?.['tabPosition'] - Tab position (top, bottom, left, right)

***Exposed Variables:***
- currentTab: Current active tab index (0-based). ***READ ONLY*** (path: variables['current_element_uid-currentTab'])

***Events:***
- change: Triggered when user switches tabs. Payload: { value: number } - New active tab index
- initValueChange: Triggered when initial value changes programmatically. Payload: { value: number } - New initial tab index

***Exposed Element Actions:***
- addTab: () Creates a new tab by duplicating the last tab's structure
- removeTab: (index: number) Removes the tab at the specified index
- moveTabUp: (index: number) Moves the tab up one position (editor only)
- moveTabDown: (index: number) Moves the tab down one position (editor only)
- updateTabLabel: (payload: {index: number, label: string}) Updates custom label for a tab (editor only)

***Notes:***
- Custom tab labels are stored in tabLabels array and maintain backward compatibility
- Tab reordering preserves both header and content associations
- Content areas should have explicit width/height styling to prevent layout issues
- When using left/right positioning, alignment properties have different behavior

***Example:***
<elements>
{"uid":0,"tag":"ww-tabs","name":"Tabs","props":{"default":{"tabFields":{"items":[{"index":0,"checked":true},{"index":1,"checked":false},{"index":2,"checked":false}],"moveHandler":[null,null]},"tabLabels":["Users","General","Settings"],"fixedToTop":false,"transition":"fade","tabsPosition":"top","leftRightPosition":"0%","topBottomPosition":"0%","verticalAlignment":"center","transitionDuration":0.4,"horizontalAlignment":"flex-start"}},"children":{"tabsList":[[{"uid":1}],[{"uid":3}],[{"uid":5}]],"tabsContent":[[{"uid":7}],[{"uid":10}],[{"uid":13}]]}}
{"uid":1,"tag":"ww-flexbox","name":"Header","states":[{"id":"AW0E58","label":"active","isAppliedToChildren":true}],"styles":{"default":{"margin":"0 12px 12px 0","padding":"12px","borderRadius":"8px"},"AW0E58_default":{"backgroundColor":"#FAFAFA"}},"slots":{"children":[{"uid":2}]}}
{"uid":2,"tag":"ww-text","name":"Label","props":{"default":{"tag":"h1","bgColor":"","shadows":"","fontStyle":"ww-font-style-header","textColor":"","transformation":"","text":{"en":"<div>Users</div>"}}},"styles":{"default":{"fontSize":"14px","fontWeight":400,"lineHeight":"20px","textDecorationStyle":"solid"}}}
{"uid":3,"tag":"ww-flexbox","name":"Header","states":[{"id":"Ceia16","label":"active","isAppliedToChildren":true}],"styles":{"default":{"margin":"0 12px 12px 0","padding":"12px","borderRadius":"8px"},"Ceia16_default":{"backgroundColor":"#FAFAFA"}},"slots":{"children":[{"uid":4}]}}
{"uid":4,"tag":"ww-text","name":"Label","props":{"default":{"tag":"h1","bgColor":"","shadows":"","fontStyle":"ww-font-style-header","textColor":"","transformation":"","text":{"en":"<div>General</div>"}}},"styles":{"default":{"fontSize":"14px","fontWeight":400,"lineHeight":"20px","textDecorationStyle":"solid"}}}
{"uid":5,"tag":"ww-flexbox","name":"Header","states":[{"id":"Ne14Tn","label":"active","isAppliedToChildren":true}],"styles":{"default":{"margin":"0 12px 12px 0","padding":"12px","borderRadius":"8px"},"Ne14Tn_default":{"backgroundColor":"#FAFAFA"}},"slots":{"children":[{"uid":6}]}}
{"uid":6,"tag":"ww-text","name":"Label","props":{"default":{"tag":"h1","bgColor":"","shadows":"","fontStyle":"ww-font-style-header","textColor":"","transformation":"","text":{"en":"<div>Settings</div>"}}},"styles":{"default":{"fontSize":"14px","fontWeight":400,"lineHeight":"20px","textDecorationStyle":"solid"}}}
{"uid":7,"tag":"ww-flexbox","name":"Tab #2","styles":{"default":{"border":"1px solid #E6E6E6","height":"198px","aspectRatio":"unset","borderRadius":"16px","rowGap":"4px","alignItems":"center","flexDirection":"column","justifyContent":"center"}},"slots":{"children":[{"uid":8},{"uid":9}]}}
{"uid":8,"tag":"ww-text","props":{"default":{"tag":"p","bgColor":"","shadows":"","fontStyle":"ww-font-style-text","textColor":"","transformation":"","text":{"en":"<div>Tab Content 'Users'</div>"}}},"styles":{"default":{"fontSize":"16px","fontWeight":600}}}
{"uid":9,"tag":"ww-text","props":{"default":{"tag":"p","bgColor":"","shadows":"","fontStyle":"ww-font-style-text","textColor":"","transformation":"","text":{"en":"<div>This is where your tab content goes.</div>"}}},"styles":{"default":{"color":"#3D3D3D","fontSize":"14px"}}}
{"uid":10,"tag":"ww-flexbox","name":"Tab #1","styles":{"default":{"border":"1px solid #E6E6E6","height":"198px","aspectRatio":"unset","borderRadius":"16px","rowGap":"4px","alignItems":"center","flexDirection":"column","justifyContent":"center"}},"slots":{"children":[{"uid":11},{"uid":12}]}}
{"uid":11,"tag":"ww-text","props":{"default":{"tag":"p","bgColor":"","shadows":"","fontStyle":"ww-font-style-text","textColor":"","transformation":"","text":{"en":"<div>Tab Content 'General'</div>"}}},"styles":{"default":{"fontSize":"16px","fontWeight":600}}}
{"uid":12,"tag":"ww-text","props":{"default":{"tag":"p","bgColor":"","shadows":"","fontStyle":"ww-font-style-text","textColor":"","transformation":"","text":{"en":"<div>This is where your tab content goes.</div>"}}},"styles":{"default":{"color":"#3D3D3D","fontSize":"14px"}}}
{"uid":13,"tag":"ww-flexbox","name":"Tab #3","styles":{"default":{"border":"1px solid #E6E6E6","height":"198px","aspectRatio":"unset","borderRadius":"16px","rowGap":"4px","alignItems":"center","flexDirection":"column","justifyContent":"center"}},"slots":{"children":[{"uid":14},{"uid":15}]}}
{"uid":14,"tag":"ww-text","props":{"default":{"tag":"p","bgColor":"","shadows":"","fontStyle":"ww-font-style-text","textColor":"","transformation":"","text":{"en":"<div>Tab Content 'Settings'</div>"}}},"styles":{"default":{"fontSize":"16px","fontWeight":600}}}
{"uid":15,"tag":"ww-text","props":{"default":{"tag":"p","bgColor":"","shadows":"","fontStyle":"ww-font-style-text","textColor":"","transformation":"","text":{"en":"<div>This is where your tab content goes.</div>"}}},"styles":{"default":{"color":"#3D3D3D","fontSize":"14px"}}}
</elements>

