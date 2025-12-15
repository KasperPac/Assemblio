export default {
    editor: {
        label: {
            en: 'Tabs',
            fr: 'Onglets',
        },
        icon: 'collection',
        bubble: {
            icon: 'collection',
        },
        navigator: {
            groups: ['Headers', 'Contents'],
        },
        customStylePropertiesOrder: [
            'tabsPosition',
            ['horizontalAlignment', 'verticalAlignment'],
            ['transition', 'transitionDuration'],
        ],
    },
    options: {
        displayAllowedValues: ['flex', 'inline-flex'],
    },
    actions: [
        {
            action: 'addTab',
            label: { en: 'Add tab' },
        },
        {
            action: 'removeTab',
            label: { en: 'Remove tab' },
            args: [
                {
                    name: 'index',
                    type: 'number',
                    label: { en: 'Tab index' },
                },
            ],
        },
        {
            action: 'moveTabUp',
            label: { en: 'Move tab up' },
            args: [
                {
                    name: 'index',
                    type: 'number',
                    label: { en: 'Tab index' },
                },
            ],
        },
        {
            action: 'moveTabDown',
            label: { en: 'Move tab down' },
            args: [
                {
                    name: 'index',
                    type: 'number',
                    label: { en: 'Tab index' },
                },
            ],
        },
        {
            action: 'updateTabLabel',
            label: { en: 'Update tab label' },
            args: [
                {
                    name: 'payload',
                    type: 'object',
                    label: { en: 'Tab data' },
                    options: {
                        item: {
                            index: { type: 'number', label: { en: 'Tab index' } },
                            label: { type: 'string', label: { en: 'New label' } },
                        },
                    },
                },
            ],
        },
    ],
    triggerEvents: [
        { name: 'change', label: { en: 'On change' }, event: { value: '' } },
        { name: 'initValueChange', label: { en: 'On init value change' }, event: { value: '' } },
    ],
    properties: {
        tabIndex: {
            label: { en: 'Tabs', fr: 'Tabs' },
            type: 'Tabs',
            editorOnly: true,
            options: content => ({
                labels: content.tabsList.map((_, index) => ({
                    label: content.tabLabels?.[index] || `Tab ${index}`,
                    customizable: true,
                })),
                nbTabs: content.tabsList.length,
                add: 'addTab',
                remove: 'removeTab',
                orderable: true,
                moveUp: 'moveTabUp',
                moveDown: 'moveTabDown',
                updateLabel: 'updateTabLabel',
            }),
            section: 'settings',
            defaultValue: 0,
        },
        tabsPosition: {
            label: {
                en: 'Tabs position',
                fr: 'Position des tabs',
            },
            type: 'TextSelect',
            options: {
                options: [
                    { value: 'top', label: 'Top' },
                    { value: 'bottom', label: 'Bottom' },
                    { value: 'left', label: 'Left' },
                    { value: 'right', label: 'Right' },
                ],
            },
            responsive: true,
            states: true,
            bindable: true,
            classes: true,
            defaultValue: 'top',
        },
        horizontalAlignment: {
            label: {
                en: 'Hor. Align.',
            },
            type: 'TextRadioGroup',
            options: content => {
                if (content.tabsPosition === 'top' || content.tabsPosition === 'bottom') {
                    return {
                        choices: [
                            { value: 'flex-start', title: { en: 'Start', fr: 'Début' }, icon: 'align-x-start' },
                            { value: 'center', title: { en: 'Center', fr: 'Milieu' }, icon: 'align-x-center' },
                            { value: 'flex-end', title: { en: 'End', fr: 'Fin' }, icon: 'align-x-end' },
                            {
                                value: 'space-around',
                                title: { en: 'Space around', fr: 'Space around' },
                                icon: 'align-x-space-around',
                            },
                            {
                                value: 'space-between',
                                title: { en: 'Space between', fr: 'Space between' },
                                icon: 'align-x-space-between',
                            },
                        ],
                    };
                } else {
                    return {
                        choices: [
                            { value: 'start', title: { en: 'Start', fr: 'Début' }, icon: 'align-left' },
                            { value: 'center', title: { en: 'Center', fr: 'Milieu' }, icon: 'align-center' },
                            { value: 'end', title: { en: 'End', fr: 'Fin' }, icon: 'align-right' },
                        ],
                    };
                }
            },
            states: true,
            bindable: true,
            classes: true,
            defaultValue: 'center',
        },
        verticalAlignment: {
            label: {
                en: 'Vert. Align',
            },
            type: 'TextRadioGroup',
            options: content => {
                if (content.tabsPosition === 'top' || content.tabsPosition === 'bottom') {
                    return {
                        choices: [
                            {
                                value: 'start',
                                title: { en: 'Start', fr: 'Début' },
                                icon: 'align-top',
                            },
                            { value: 'center', title: { en: 'Center', fr: 'Milieu' }, icon: 'align-middle' },
                            { value: 'end', title: { en: 'End', fr: 'Fin' }, icon: 'align-bottom' },
                        ],
                    };
                } else {
                    return {
                        choices: [
                            {
                                value: 'flex-start',
                                title: { en: 'Start', fr: 'Début' },
                                icon: 'align-x-start-vertical',
                            },
                            { value: 'center', title: { en: 'Center', fr: 'Milieu' }, icon: 'align-x-center-vertical' },
                            { value: 'flex-end', title: { en: 'End', fr: 'Fin' }, icon: 'align-x-end-vertical' },
                            {
                                value: 'space-around',
                                title: { en: 'Space around', fr: 'Space around' },
                                icon: 'align-x-space-around-vertical',
                            },
                            {
                                value: 'space-between',
                                title: { en: 'Space between', fr: 'Space between' },
                                icon: 'align-x-space-between-vertical',
                            },
                        ],
                    };
                }
            },
            states: true,
            bindable: true,
            classes: true,
            defaultValue: 'center',
        },
        transition: {
            label: { en: 'Transition', fr: 'Transition' },
            type: 'TextSelect',
            options: {
                options: [
                    { value: 'none', label: { en: 'None', fr: 'Aucune' } },
                    { value: 'fade', label: { en: 'Fade', fr: 'Fade' } },
                    { value: 'fadeTopBottom', label: { en: 'Fade top / bottom', fr: 'Fade top / bottom' } },
                    { value: 'fadeLeftRight', label: { en: 'Fade right / left', fr: 'Fade right / left' } },
                ],
            },
            defaultValue: 'fade',
            states: true,
            bindable: true,
            classes: true,
        },
        transitionDuration: {
            type: 'Number',
            label: { en: 'Transition duration', fr: 'Durée de la transition' },
            options: {
                min: 0,
                max: 5,
                step: 0.1,
            },
            defaultValue: 0.4,
            states: true,
            bindable: true,
            classes: true,
        },
        tabsList: {
            hidden: true,
            defaultValue: [],
            navigator: {
                group: 'Headers',
            },
        },
        tabsContent: {
            hidden: true,
            defaultValue: [],
            navigator: {
                group: 'Contents',
            },
        },
        tabLabels: {
            hidden: true,
            defaultValue: [],
        },
        value: {
            label: {
                en: 'Active tab index',
            },
            type: 'Number',
            options: content => ({
                min: 0,
                max: Math.max(0, content.tabsList.length - 1),
            }),
            section: 'settings',
            bindable: true,
        },
    },
};
