<template>
    <div class="ww-input-select__trigger">
        <!-- SINGLE SELECT -->
        <div v-if="isSingleSelect" :style="triggerStyle">
            <div v-if="isOptionSelected" class="ww-input-select__selected">
                <div
                    v-if="selectedIconHtml"
                    v-html="selectedIconHtml"
                    :style="selectedMediaIconStyle"
                    aria-hidden="true"
                ></div>
                <img v-else-if="selectedImageUrl" :src="selectedImageUrl" :style="selectedMediaImageStyle" alt="" />
                <span :style="selectedValueStyle">{{ selectedLabel }}</span>
            </div>
            <span v-else :style="placeholderStyle">{{ data.placeholder }}</span>
            <div v-html="chipIcon" :style="triggerIconStyle" aria-hidden="true"></div>
        </div>
        <!-- MULTI SELECT -->
        <div v-else :style="triggerStyle">
            <div v-if="isOptionSelected" class="ww-input-select__chip_container">
                <div
                    class="ww-input-select__chip"
                    v-for="option in selectedChips"
                    :key="option.value"
                    @click="e => handleChipClick(e, option.value)"
                    :style="chipStyle"
                >
                    <div
                        v-if="option.iconHtml"
                        v-html="option.iconHtml"
                        :style="chipMediaIconStyle"
                        aria-hidden="true"
                    ></div>
                    <img v-else-if="option.imageUrl" :src="option.imageUrl" :style="chipMediaImageStyle" alt="" />
                    <span>{{ option.label }}</span>
                    <div v-html="chipIconUnselect" :style="chipIconStyle" aria-hidden="true"></div>
                </div>
            </div>
            <span v-else :style="placeholderStyle">{{ data.placeholder }}</span>
            <div v-html="chipIcon" :style="triggerIconStyle" aria-hidden="true"></div>
        </div>
    </div>
</template>

<script>
import { computed, inject, ref, watch } from 'vue';

const CLOSE_CHIP_PLACEHOLDER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up"><path d="m18 15-6-6-6 6"/></svg>';
const OPEN_CHIP_PLACEHOLDER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>';
const UNSELECT_CHIP_PLACEHOLDER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x"><path d="M18 6 6 18M6 6l12 12"/></svg>';

export default {
    props: {
        content: { type: Object, required: true },
    },
    emits: ['remove-multiselect-value'],
    setup(props, { emit }) {
        const { getIcon } = wwLib.useIcons();

        const registerTriggerLocalContext = inject('_wwSelect:registerTriggerLocalContext');
        const localContext = inject('_wwSelect:localContext');
        const optionType = inject('_wwSelect:optionType', ref('text'));

        const isSingleSelect = computed(() => props.content.selectType === 'single');

        const placeholder = computed(() => wwLib.wwLang.getText(props.content.placeholder));
        const selectedLabel = computed(() => {
            return localContext.value?.data?.select?.active?.details?.label;
        });
        const selectedIconCode = computed(() => {
            if (optionType.value !== 'iconText') return null;
            return localContext.value?.data?.select?.active?.details?.icon || null;
        });
        const selectedImageUrl = computed(() => {
            if (optionType.value !== 'imageText') return null;
            const url = localContext.value?.data?.select?.active?.details?.image || null;
            if (!url) return null;
            try {
                const str = String(url);
                if (str.startsWith('designs/')) return `${wwLib.wwUtils.getCdnPrefix()}${str}`;
                return str;
            } catch (e) {
                return null;
            }
        });
        const selectedIconHtml = ref(null);
        watch(
            selectedIconCode,
            async code => {
                if (code) selectedIconHtml.value = (await getIcon(code)) || null;
                else selectedIconHtml.value = null;
            },
            { immediate: true }
        );
        const isOptionSelected = computed(
            () =>
                !!localContext.value?.data?.select?.active?.details?.label ||
                localContext.value?.data?.select?.active?.details?.length > 0
        );

        const selectedDetails = computed(() => {
            const details = localContext.value?.data?.select?.active?.details;
            return Array.isArray(details) ? details : [];
        });

        const selectedChips = ref([]);

        watch(
            [selectedDetails, optionType],
            async ([details]) => {
                const enriched = [];
                for (const d of details) {
                    let iconHtml = null;
                    let imageUrl = null;

                    if (optionType.value === 'iconText' && d?.icon) {
                        try {
                            iconHtml = (await getIcon(d.icon)) || null;
                        } catch (e) {
                            iconHtml = null;
                        }
                    }

                    if (optionType.value === 'imageText' && d?.image) {
                        try {
                            const str = String(d.image);
                            imageUrl = str.startsWith('designs/') ? `${wwLib.wwUtils.getCdnPrefix()}${str}` : str;
                        } catch (e) {
                            imageUrl = null;
                        }
                    }

                    enriched.push({ ...d, iconHtml, imageUrl });
                }
                selectedChips.value = enriched;
            },
            { immediate: true, deep: true }
        );

        const isOpen = computed(() => localContext.value?.data?.select?.utils?.isOpen);
        const data = ref({
            placeholder,
        });

        const markdown = `### Select Trigger local informations

- \`placeholder\`: The placeholder text for the select trigger.`;

        registerTriggerLocalContext({ data, methods: {}, markdown });

        const triggerStyle = computed(() => {
            const borderCss = !props.content.triggerBorder
                ? {
                      border: props.content.triggerBorderAll,
                  }
                : {
                      'border-top': props.content.triggerBorderTop,
                      'border-right': props.content.triggerBorderRight,
                      'border-bottom': props.content.triggerBorderBottom,
                      'border-left': props.content.triggerBorderLeft,
                  };

            return {
                padding: props.content.triggerPadding,
                margin: props.content.triggerMargin,
                'background-color': props.content.triggerBgColor,
                width: '100%',
                height: props.content.triggerHeight,
                'border-radius': props.content.triggerBorderRadius,
                'box-shadow': props.content.triggerShadows,
                cursor: 'pointer',

                display: 'flex',
                'flex-direction': 'row',
                'align-items': 'center',
                'justify-content': 'space-between',

                ...borderCss,
            };
        });

        const triggerIconStyle = computed(() => {
            return {
                width: props.content.triggerIconSize,
                color: props.content.triggerIconColor,
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'pointer-events': 'none',
            };
        });

        const selectedMediaIconStyle = computed(() => {
            return {
                width: props.content.triggerIconSize,
                color: props.content.selectedFontColor,
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'pointer-events': 'none',
                'margin-right': '8px',
            };
        });
        const selectedMediaImageStyle = computed(() => {
            return {
                width: props.content.triggerImageSize || props.content.triggerIconSize,
                height: props.content.triggerImageSize || props.content.triggerIconSize,
                'object-fit': 'cover',
                'border-radius': props.content.triggerImageRadius || '4px',
                'margin-right': '8px',
            };
        });

        const selectedValueStyle = computed(() => {
            return {
                'font-size': props.content.selectedFontSize,
                'font-family': props.content.selectedFontFamily,
                color: props.content.selectedFontColor,
                'font-weight': props.content.selectedFontWeight,
                'text-align': props.content.selectedTextAlign,
                width: '100%',
            };
        });

        const placeholderStyle = computed(() => {
            return {
                'font-size': props.content.placeholderFontSize,
                'font-family': props.content.placeholderFontFamily,
                color: props.content.placeholderFontColor,
                'font-weight': props.content.placeholderFontWeight,
                'text-align': props.content.placeholderTextAlign,
                width: '100%',
            };
        });

        const chipStyle = computed(() => {
            const borderCss = !props.content.chipBorder
                ? {
                      border: props.content.chipBorderAll,
                  }
                : {
                      'border-top': props.content.chipBorderTop,
                      'border-right': props.content.chipBorderRight,
                      'border-bottom': props.content.chipBorderBottom,
                      'border-left': props.content.chipBorderLeft,
                  };

            return {
                'font-size': props.content.chipFontSize,
                'font-family': props.content.chipFontFamily,
                color: props.content.chipFontColor,
                'font-weight': props.content.chipFontWeight,
                padding: props.content.chipPadding,
                'background-color': props.content.chipBgColor,
                'border-radius': props.content.chipBorderRadius,
                ...borderCss,
            };
        });

        const chipIcon = ref(null);
        const chipIconUnselect = ref(null);

        watch(
            [isOpen, () => props.content.triggerIconOpen, () => props.content.triggerIconClose],
            async () => {
                const iconKey = isOpen.value ? 'triggerIconClose' : 'triggerIconOpen';
                const defaultIcon = isOpen.value ? CLOSE_CHIP_PLACEHOLDER : OPEN_CHIP_PLACEHOLDER;

                if (props.content[iconKey]) {
                    chipIcon.value = (await getIcon(props.content[iconKey])) || defaultIcon;
                } else {
                    chipIcon.value = defaultIcon;
                }
            },
            { immediate: true }
        );

        watch(
            () => props.content.chipIconUnselect,
            async newValue => {
                if (newValue) {
                    chipIconUnselect.value = (await getIcon(newValue)) || UNSELECT_CHIP_PLACEHOLDER;
                } else {
                    chipIconUnselect.value = UNSELECT_CHIP_PLACEHOLDER;
                }
            },
            { immediate: true }
        );

        const chipIconStyle = computed(() => {
            return {
                width: props.content.chipIconSize,
                color: props.content.chipIconColor,
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                'pointer-events': 'none',
            };
        });

        const chipMediaIconStyle = computed(() => ({
            width: props.content.chipIconSize,
            color: props.content.chipFontColor,
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'pointer-events': 'none',
        }));
        const chipMediaImageStyle = computed(() => ({
            width: props.content.chipImageSize || props.content.chipIconSize,
            height: props.content.chipImageSize || props.content.chipIconSize,
            'object-fit': 'cover',
            'border-radius': props.content.chipImageRadius || '4px',
        }));
        const chipIconFromOption = iconCode => (iconCode ? getIcon(iconCode) : null);

        const handleChipClick = (event, value) => {
            event.stopPropagation();
            emit('remove-multiselect-value', value);
        };

        return {
            isSingleSelect,
            data,
            selectedLabel,
            selectedIconHtml,
            selectedMediaIconStyle,
            selectedMediaImageStyle,
            selectedImageUrl,
            isOptionSelected,
            localContext,
            selectedChips,
            triggerStyle,
            triggerIconStyle,
            selectedValueStyle,
            placeholderStyle,
            chipIcon,
            chipStyle,
            chipIconStyle,
            chipIconUnselect,
            chipMediaIconStyle,
            chipMediaImageStyle,
            chipIconFromOption,
            isOpen,
            handleChipClick,
        };
    },
};
</script>

<style lang="scss" scoped>
.ww-input-select__trigger {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;

    .ww-input-select__selected {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;

        & > div,
        & > img {
            flex-shrink: 0;
        }

        & > span {
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
    }

    .ww-input-select__chip_container {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 5px;
        width: 100%;
        flex-wrap: wrap;

        .ww-input-select__chip {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 5px;
            cursor: pointer;
        }
    }
}

.ww-select-trigger {
    width: 100%;
}
</style>
