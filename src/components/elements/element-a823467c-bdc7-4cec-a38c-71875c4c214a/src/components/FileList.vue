<template>
    <div class="ww-file-list" role="list" aria-label="Uploaded files">
        <transition-group name="file-list-transition" tag="div" class="ww-file-list__inner">
            <FileItem
                v-for="(file, index) in files"
                :key="file.id || `file-${index}-${file.name}-${file.size}`"
                :file="file"
                :status="getFileStatus(file)"
                :index="index"
                :is-readonly="isReadonly"
                :is-disabled="isDisabled"
                @remove="$emit('remove', index)"
            />
        </transition-group>
    </div>
</template>

<script>
import FileItem from './FileItem.vue';

export default {
    name: 'FileList',
    components: {
        FileItem,
    },
    props: {
        files: {
            type: Array,
            required: true,
        },
        status: {
            type: Object,
            required: true,
        },
        type: {
            type: String,
            default: 'single',
            validator: value => ['single', 'multi'].includes(value),
        },
        isReadonly: {
            type: Boolean,
            default: false,
        },
        isDisabled: {
            type: Boolean,
            default: false,
        },
    },
    emits: ['remove'],
    setup(props) {
        const getFileStatus = file => {
            if (!file?.name || !props.status) return {};
            return props.status[file.name] || {};
        };

        return {
            getFileStatus,
        };
    },
};
</script>

<style lang="scss" scoped>
.ww-file-list {
    display: flex;
    flex-direction: column;
    width: 100%;

    &__inner {
        position: relative;
        min-height: 0;
        will-change: transform;
    }
}

.file-list-transition-enter-active {
    transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
    transition-delay: 0.05s;
}

.file-list-transition-enter-from {
    opacity: 0;
    transform: translateY(20px);
}

.file-list-transition-move {
    transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.file-list-transition-leave-active {
    transition: all 0.15s cubic-bezier(0.25, 0.8, 0.25, 1);
    position: absolute;
    width: 100%;
    opacity: 0;
}
</style>
