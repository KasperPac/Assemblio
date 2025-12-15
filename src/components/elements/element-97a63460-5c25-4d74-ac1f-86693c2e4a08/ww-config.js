export default {
    editor: {
        label: {
            en: 'Checkbox',
            fr: 'Checkbox',
        },
        icon: 'check',
    },
    states: ['checked', 'readonly'],
    options: {
        displayAllowedValues: ['flex', 'inline-flex'],
    },
    properties: {
        color: {
            label: { en: 'Color', fr: 'Couleur' },
            type: 'Color',
            bindable: true,
            responsive: true,
            states: true,
            classes: true,
            defaultValue: '#00000000',
        },
        icon: {
            label: { en: 'Icon', fr: 'Icône' },
            type: 'SystemIcon',
            bindable: true,
            responsive: true,
            states: true,
            classes: true,
            defaultValue: 'lucide/check',
        },
    },
};
