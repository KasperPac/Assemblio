export default {
    editor: {
        label: {
            en: 'Checkbox',
            fr: 'Checkbox',
        },
        icon: 'check',
        customSettingsPropertiesOrder: [
            'formInfobox',
            ['fieldName', 'customValidation', 'validation'],
            'value',
            'readonly',
            'required',
            'isEmbeddedContainer',
            'containerPosition',
        ],
    },
    states: ['checked', 'readonly'],
    options: {
        displayAllowedValues: ['flex', 'inline-flex'],
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
            defaultValue: false,
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
        isEmbeddedContainer: {
            type: 'OnOff',
            label: {
                en: 'Embedded container',
                fr: 'Embedded container',
            },
            section: 'settings',
            responsive: true,
            defaultValue: false,
        },
        containerPosition: {
            hidden: content => !content.isEmbeddedContainer,
            label: {
                en: 'Container position',
                fr: 'Position du container',
            },
            type: 'TextSelect',
            options: {
                options: [
                    { value: 'right', label: { en: 'Right' } },
                    { value: 'left', label: { en: 'Left' } },
                    { value: 'top', label: { en: 'Top' } },
                    { value: 'bottom', label: { en: 'Bottom' } },
                ],
            },
            section: 'settings',
            responsive: true,
            states: true,
            classes: true,
            defaultValue: 'right',
        },
        containerGap: {
            hidden: content => !content.isEmbeddedContainer,
            label: {
                en: 'Container gap',
                fr: 'Espacement du container',
            },
            type: 'Length',
            options: {
                unitChoices: [
                    { value: 'px', label: 'px', min: 0, max: 100 },
                    { value: 'em', label: 'em', min: 0, max: 10, digits: 3, step: 0.1 },
                    { value: 'rem', label: 'rem', min: 0, max: 10, digits: 3, step: 0.1 },
                ],
            },
            responsive: true,
            states: true,
            classes: true,
            bindable: true,
            defaultValue: '0px',
        },
        embeddedContainer: {
            hidden: true,
            defaultValue: null,
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
        checkbox: {
            hidden: true,
            defaultValue: {
                isWwObject: true,
                type: '97a63460-5c25-4d74-ac1f-86693c2e4a08',
                content: {
                    color: '#FFFFFF',
                    fontSize: 10,
                    icon: 'lucide/check',
                },
                state: {
                    states: [{ id: 'checked', label: 'checked' }],
                    style: {
                        default: {
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #767676',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            height: 'auto',
                            padding: '2px',
                            width: 'auto',
                        },
                        checked_default: {
                            backgroundColor: '#767676',
                        },
                    },
                },
            },
        },
    },
};
