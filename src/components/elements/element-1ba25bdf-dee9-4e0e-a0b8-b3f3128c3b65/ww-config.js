export default {
    editor: {
        label: {
            en: 'Toggle',
            fr: 'Toggle',
        },
        icon: 'toggle',
        customSettingsPropertiesOrder: [
            'formInfobox',
            ['fieldName', 'customValidation', 'validation'],
            'value',
            'readonly',
            'required',
        ],
    },
    options: {
        ignoredStyleProperties: ['background'],
    },
    triggerEvents: [
        { name: 'change', label: { en: 'On change' }, event: { value: '' }, default: true },
        { name: 'initValueChange', label: { en: 'On init value change' }, event: { value: '' } },
    ],
    properties: {
        value: {
            label: {
                en: 'Init value',
            },
            type: 'OnOff',
            section: 'settings',
            bindable: true,
        },
        required: {
            label: 'Required',
            type: 'OnOff',
            section: 'settings',
            defaultValue: true,
            bindable: true,
        },
        readonly: {
            label: { en: 'Read only', fr: 'Lecture seule' },
            type: 'OnOff',
            section: 'settings',
            bindable: true,
            defaultValue: false,
            hidden: (content, sidePanelContent, boundProps, wwProps) => !!(wwProps && wwProps.readonly !== undefined),
        },
        selectorSize: {
            type: 'Length',
            label: {
                en: 'Selector size',
                fr: 'Taille du selecteur',
            },
            options: {
                unitChoices: [{ value: '%', label: '%', min: 10, max: 100 }],
            },
            defaultValue: '100%',
            states: true,
            classes: true,
            responsive: true,
            bindable: true,
        },
        selectorColorOff: {
            type: 'Color',
            label: {
                en: 'Selector color (off)',
                fr: 'Couleur du selecteur (off)',
            },
            options: {
                nullable: true,
            },
            states: true,
            classes: true,
            responsive: true,
            bindable: true,
        },
        selectorColorOn: {
            type: 'Color',
            label: {
                en: 'Selector color (on)',
                fr: 'Couleur du selecteur (on)',
            },
            options: {
                nullable: true,
            },
            states: true,
            classes: true,
            responsive: true,
            bindable: true,
        },
        backgroundColorOff: {
            type: 'Color',
            label: {
                en: 'Background color (off)',
                fr: 'Couleur de fond (off)',
            },
            options: {
                nullable: true,
            },
            states: true,
            classes: true,
            responsive: true,
            bindable: true,
        },
        backgroundColorOn: {
            type: 'Color',
            label: {
                en: 'Background color (on)',
                fr: 'Couleur de fond (on)',
            },
            options: {
                nullable: true,
            },
            states: true,
            classes: true,
            responsive: true,
            bindable: true,
        },
        toggleState: {
            type: 'Button',
            options: {
                text: { en: 'Toggle state', fr: 'Toggle state' },
                color: 'blue',
                action: 'toggleValue',
            },
            editorOnly: true,
        },
        fieldName: {
            label: 'Field name',
            section: 'settings',
            type: 'Text',
            defaultValue: '',
            bindable: true,
            hidden: (_, sidePanelContent) => {
                return !sidePanelContent.form?.uid;
            },
        },
        customValidation: {
            label: 'Custom validation',
            section: 'settings',
            type: 'OnOff',
            defaultValue: false,
            bindable: true,
            hidden: (_, sidePanelContent) => {
                return !sidePanelContent.form?.uid;
            },
        },
        validation: {
            label: 'Validation',
            section: 'settings',
            type: 'Formula',
            defaultValue: '',
            bindable: false,
            hidden: (content, sidePanelContent) => {
                return !sidePanelContent.form?.uid || !content.customValidation;
            },
        },
    },
};
