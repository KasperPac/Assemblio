<template>
    <div class="tabs-object" :class="{ editing: isEditing }" :style="tabsObjectStyle" ww-responsive="tabs-object">
        <div v-if="content.tabsList" class="tabs-container" :style="tabsContainerStyle" ww-responsive="tabs-container">
            <div v-for="index in nbOfTabs" :key="index" class="layout-container" @click="switchToTab(index - 1)">
                <wwLocalContext 
                    elementKey="tab" 
                    :data="{
                        tabIndex: index - 1,
                        tabLabel: content.tabLabels?.[index - 1] || `Tab ${index}`,
                        isActive: index - 1 === currentTabIndex,
                        totalTabs: nbOfTabs,
                        tabPosition: content.tabsPosition
                    }"
                >
                    <div class="layout-sublayout">
                        <wwLayout class="layout -layout" :path="`tabsList[${index - 1}]`">
                            <template #default="{ item }">
                                <wwLayoutItem>
                                    <wwElement v-bind="item" :states="index - 1 === currentTabIndex ? ['active'] : []" />
                                </wwLayoutItem>
                            </template>
                        </wwLayout>
                    </div>
                </wwLocalContext>
            </div>
        </div>
        <div class="tab-contents">
            <transition-group :name="activeTransition" mode="out-in" tag="div">
                <template v-for="index in nbOfTabs">
                    <div v-if="currentTabIndex === index - 1" :key="index" class="tab-content">
                        <wwLocalContext 
                            elementKey="tab" 
                            :data="{
                                tabIndex: index - 1,
                                tabLabel: content.tabLabels?.[index - 1] || `Tab ${index}`,
                                isActive: true,
                                totalTabs: nbOfTabs,
                                tabPosition: content.tabsPosition
                            }"
                        >
                            <wwLayout
                                class="layout -layout"
                                :class="{ isEditing: isEditing }"
                                :path="`tabsContent[${index - 1}]`"
                            />
                        </wwLocalContext>
                    </div>
                </template>
            </transition-group>
        </div>
    </div>
</template>

<script>
import { computed } from 'vue';

export default {
    props: {
        content: { type: Object, required: true },
        wwFrontState: { type: Object, required: true },
        uid: { type: String, required: true },
    },
    emits: ['update:content', 'trigger-event', 'update:sidepanel-content'],
    setup(props, { emit }) {
        const nbOfTabs = computed(() => props.content.tabsList.length);
        const { value: variableValue, setValue } = wwLib.wwVariable.useComponentVariable({
            uid: props.uid,
            name: 'currentTab',
            type: 'number',
            defaultValue: computed(() =>
                props.content.value === undefined ? 0 : Math.max(0, Math.min(props.content.value, nbOfTabs.value - 1))
            ),
        });

        const currentTabIndex = computed({
            get() {
                const index = variableValue.value;
                return Math.max(0, Math.min(index, nbOfTabs.value - 1));
            },
            set(index) {
                // Secure index range
                index = Math.max(0, Math.min(index, nbOfTabs.value - 1));
                if (index === currentTabIndex.value) return;
                setValue(index);
                emit('trigger-event', { name: 'change', event: { value: index } });
            }
        });



        const setCurrentTabIndex = (index) => {
            // Secure index range
            index = Math.max(0, Math.min(index, nbOfTabs.value - 1));
            if (index === currentTabIndex.value) return;
            
            setValue(index);
        };

        return {
            variableValue,
            setValue,
            nbOfTabs,
            currentTabIndex,
            setCurrentTabIndex,
        };
    },
    data() {
        return {
            order: null,
            activeTransition: 'fade',
        };
    },
    computed: {
        isEditing() {
            // eslint-disable-next-line no-unreachable
            return false;
        },
        tabsObjectStyle() {
            const style = { '--tab-transition-duration': this.content.transitionDuration + 's' };

            switch (this.content.tabsPosition) {
                case 'top':
                    style['flex-direction'] = 'column';
                    break;
                case 'bottom':
                    style['flex-direction'] = 'column-reverse';
                    break;
                case 'left':
                    style['flex-direction'] = 'row';
                    break;
                case 'right':
                    style['flex-direction'] = 'row-reverse';
                    break;
            }
            return style;
        },
        getSublayoutHeight() {
            const elHeight = wwLib.getFrontDocument().querySelectorAll('.tabs-sublayout-container');
            if (elHeight && elHeight.length && elHeight[this.currentTabIndex]) {
                return `${elHeight[this.currentTabIndex].offsetHeight}px`;
            }
            return '24px';
        },
        tabsContainerStyle() {
            const isHorizontal = this.content.tabsPosition === 'top' || this.content.tabsPosition === 'bottom';

            const style = {
                justifyContent: isHorizontal ? this.content.horizontalAlignment : this.content.verticalAlignment,
                alignItems: !isHorizontal ? this.content.horizontalAlignment : this.content.verticalAlignment,
            };

            if (this.content.tabsPosition === 'left' || this.content.tabsPosition === 'right') {
                style['flex-direction'] = 'column';
                style['width'] = 'auto';
                style['min-width'] = '10px';
            }

            return style;
        },
    },
    watch: {
        'content.value'(value) {
            // Secure index range
            const index = Math.max(0, Math.min(value, this.nbOfTabs - 1));
            if (index === this.currentTabIndex) return;
            this.currentTabIndex = index;
            this.$emit('trigger-event', { name: 'initValueChange', event: { value: index } });
        },
    },
    methods: {
        switchToTab(index) {
            // Secure index range
            index = Math.max(0, Math.min(index, this.nbOfTabs - 1));
            if (index === this.currentTabIndex) return;

            // Transition
            this.order = index > this.currentTabIndex ? 'after' : 'before';
            this.handleTransition(this.order);

            // Updating (event will be emitted by the setter)
            this.currentTabIndex = index;
        },
        handleTransition(order) {
            switch (this.content.transition) {
                case 'fade':
                    this.activeTransition = 'fade';
                    break;
                case 'none':
                    this.activeTransition = '';
                    break;
                case 'fadeTopBottom':
                    this.activeTransition = order === 'after' ? 'fadeTop' : 'fadeBottom';
                    break;
                case 'fadeLeftRight':
                    this.activeTransition = order === 'after' ? 'fadeLeft' : 'fadeRight';
                    break;
                default:
                    this.activeTransition = 'fade';
            }
        },
    },
};
</script>

<style lang="scss" scoped>
.tabs-object {
    --tab-transition-duration: 0.5s;
    --tab-leftRight-position: 30%;
    --tab-topBottom-position: -50%;

    position: relative;
    flex-direction: column;
    justify-content: center;

    .tab-content {
        .layout {
            flex-direction: column;
            min-width: 200px;
        }
    }

    .tabs-container {
        z-index: 1;
        display: flex;
        flex-direction: row;
        flex-wrap: wrap;
        justify-content: center;
        align-items: flex-start;
        position: relative;
        width: 100%;
        min-width: 390px;

        @media only screen and (max-width: 400px) {
            min-width: auto;
        }

        .layout-container {
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: center;

            .layout-sublayout {
                flex-direction: row;
                justify-content: center;
                align-items: center;

                .layout {
                    flex-direction: column;
                    width: fit-content;
                    height: fit-content;
                    min-width: 80px;

                    &:hover {
                        cursor: pointer;
                    }
                }

                .sublayout {
                    flex-direction: column;
                }
            }
        }

        .tab-dropzone-container {
            width: 100%;
            height: 100%;
            padding: 10px 10px;

            .tab_dropzone {
                width: 100px;
                height: 100px;
            }
        }
    }
}

.tab-contents {
    position: relative;
    flex: 1;
}

// FADE

.fade-enter-active,
.fade-leave-active {
    transition: opacity var(--tab-transition-duration);
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

.fade-leave-active {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
}

// FADE TOP

.fadeTop-enter-active,
.fadeTop-leave-active {
    transition: all var(--tab-transition-duration);
}

.fadeTop-enter-from {
    opacity: 0;
    transform: translateY(8px);
}

.fadeTop-leave-to {
    opacity: 0;
    transform: translateY(-8px);
}

.fadeTop-leave-active {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
}

// FADE BOTTOM

.fadeBottom-enter-active,
.fadeBottom-leave-active {
    transition: all var(--tab-transition-duration);
}

.fadeBottom-enter-from {
    opacity: 0;
    transform: translateY(-8px);
}

.fadeBottom-leave-to {
    opacity: 0;
    transform: translateY(8px);
}

.fadeBottom-leave-active {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
}

// FADE LEFT

.fadeLeft-enter-active,
.fadeLeft-leave-active {
    transition: all var(--tab-transition-duration);
}

.fadeLeft-enter-from {
    opacity: 0;
    transform: translateX(8px);
}

.fadeLeft-leave-to {
    opacity: 0;
    transform: translateX(-8px);
}

.fadeLeft-leave-active {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
}

// FADE RIGHT

.fadeRight-enter-active,
.fadeRight-leave-active {
    transition: all var(--tab-transition-duration);
}

.fadeRight-enter-from {
    opacity: 0;
    transform: translateX(-8px);
}

.fadeRight-leave-to {
    opacity: 0;
    transform: translateX(8px);
}

.fadeRight-leave-active {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
}
</style>
