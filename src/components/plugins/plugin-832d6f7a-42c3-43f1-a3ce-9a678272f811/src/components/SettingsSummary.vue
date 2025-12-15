<template>
    <div class="dayjs-settings-summary">
        <wwEditorIcon large name="type" class="dayjs-settings-summary__icon" />
        <span class="body-2">{{ favoriteFormat || 'Favorite format not defined' }}</span>
    </div>
</template>

<script>
export default {
    props: {
        settings: { type: Object, required: true },
    },
    computed: {
        favoriteFormat() {
            return this.settings.publicData.favoriteFormat || '';
        },
    },
};
</script>

<style lang="scss" scoped>
.dayjs-settings-summary {
    display: flex;
    justify-content: flex-start;
    flex-direction: row;
    align-items: center;

    &__icon {
        margin-right: var(--ww-spacing-02);
    }
}
</style>
