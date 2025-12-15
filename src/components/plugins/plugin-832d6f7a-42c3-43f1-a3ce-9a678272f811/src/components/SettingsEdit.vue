<template>
    <div class="dayjs-settings-edit">
        <wwEditorFormRow label="Favorite date format">
            <wwEditorInputText
                placeholder="MMMM D, YYYY h:mm A"
                :model-value="settings.publicData.favoriteFormat"
                @update:modelValue="changeFavoriteFormat"
            />
        </wwEditorFormRow>
    </div>
</template>

<script>
export default {
    props: {
        settings: { type: Object, required: true },
    },
    emits: ['update:settings'],
    methods: {
        changeFavoriteFormat(favoriteFormat) {
            this.$emit('update:settings', {
                ...this.settings,
                publicData: { ...this.settings.publicData, favoriteFormat },
            });
        },
    },
};
</script>

<style lang="scss" scoped>
.dayjs-settings-edit {
    display: flex;
    flex-direction: column;
    &__link {
        color: var(--ww-color-blue-500);
        margin-left: var(--ww-spacing-02);
    }
    &__row {
        display: flex;
        align-items: center;

        &.-wrap {
            flex-wrap: wrap;
        }
    }
    &__radio-label {
        margin-left: var(--ww-spacing-02);
    }

    .m-auto-left {
        margin-left: auto;
    }
    .m-right {
        margin-right: var(--ww-spacing-02);
    }
    .m-bottom {
        margin-bottom: var(--ww-spacing-02);
    }
}
</style>
