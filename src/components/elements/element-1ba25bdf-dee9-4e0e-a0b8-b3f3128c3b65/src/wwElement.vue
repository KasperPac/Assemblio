<template>
    <button
        type="button"
        class="ww-webapp-toggle"
        role="switch"
        :class="{
            '-active': value,
        }"
        :aria-checked="value"
        :style="cssVariables"
        @click="handleManualInput($event)"
        :disabled="isReadonly"
    >
        <div class="selector" :class="{ '-active': value }"></div>
        <input
            type="checkbox"
            :value="value"
            class="ww-webapp-toggle__hidden"
            :name="wwElementState.name"
            :checked="value"
            :required="content.required"
            :disabled="isReadonly"
        />
    </button>
</template>

<script>
import { computed, inject } from 'vue';

export default {
    props: {
        content: { type: Object, required: true },
        uid: { type: String, required: true },
        wwElementState: { type: Object, required: true },
    },
    emits: ['update:content:effect', 'trigger-event', 'add-state', 'remove-state'],
    setup(props, { emit }) {

        const { value: variableValue, setValue } = wwLib.wwVariable.useComponentVariable({
            uid: props.uid,
            name: 'value',
            type: 'boolean',
            defaultValue: computed(() => (props.content.value === undefined ? false : props.content.value)),
        });

        const useForm = inject('_wwForm:useForm', () => {});

        const fieldName = computed(() => props.content.fieldName);
        const validation = computed(() => props.content.validation);
        const customValidation = computed(() => props.content.customValidation);
        const required = computed(() => props.content.required);

        useForm(
            variableValue,
            { fieldName, validation, customValidation, required, initialValue: computed(() => props.content.value) },
            { elementState: props.wwElementState, emit, sidepanelFormPath: 'form', setValue }
        );

        return { variableValue, setValue };
    },
    computed: {
        isEditing() {
            // eslint-disable-next-line no-unreachable
            return false;
        },
        value() {
            return !!this.variableValue;
        },
        cssVariables() {
            const unitValue = wwLib.wwUtils.getLengthUnit(this.content.selectorSize)[0];
            const securedValue = Math.min(Math.max(unitValue, 10), 100);
            const scale = securedValue / 100;
            const transitionAjustement = 100 - securedValue;

            return {
                '--selector-size': scale,
                '--transition-ajustement': `${transitionAjustement}%`,
                '--selector-color-off': this.content.selectorColorOff,
                '--selector-color-on': this.content.selectorColorOn,
                '--background-color': this.value ? this.content.backgroundColorOn : this.content.backgroundColorOff,
            };
        },
        isReadonly() {
            return this.wwElementState.props.readonly === undefined
                ? this.content.readonly
                : this.wwElementState.props.readonly;
        },
    },
    watch: {
        'content.value'(newValue) {
            newValue = !!newValue;
            if (newValue === this.value) return;
            this.setValue(newValue);
            this.$emit('trigger-event', { name: 'initValueChange', event: { value: newValue } });
        },
        isReadonly: {
            immediate: true,
            handler(value) {
                if (value) {
                    this.$emit('add-state', 'readonly');
                } else {
                    this.$emit('remove-state', 'readonly');
                }
            },
        },
    },
    methods: {
        handleManualInput($event) {
            const value = !this.value;
            this.setValue(value);
            this.$emit('trigger-event', { name: 'change', event: { domEvent: $event, value } });
        },
    },
};
</script>

<style lang="scss" scoped>
.ww-webapp-toggle {
    outline: none;
    padding: 0;
    box-sizing: content-box;
    position: relative;
    background: var(--background-color);

    .selector {
        position: absolute;
        top: 0px;
        left: 0px;
        transform: scale3d(var(--selector-size), var(--selector-size), var(--selector-size));

        height: 100%;
        aspect-ratio: 1 / 1;

        background: var(--selector-color-off);
        border-radius: inherit;
        transition: inherit;
    }

    &.-active {
        .selector {
            transition: inherit;
            background: var(--selector-color-on);
            top: 0px;
            left: 100%;
            transform: translateX(-100%) scale3d(var(--selector-size), var(--selector-size), var(--selector-size));
        }
    }
    &__hidden {
        position: absolute;
        opacity: 0;
        pointer-events: none;
    }
}
</style>
