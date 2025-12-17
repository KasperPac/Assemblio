export function validateFile(file, options = {}) {
    const { maxFileSize, minFileSize, maxTotalFileSize, currentTotalSize = 0, acceptedTypes = '' } = options;
    const fileSizeInMB = file.size / (1024 * 1024);
    const currentTotalSizeInMB = currentTotalSize / (1024 * 1024);

    if (minFileSize && fileSizeInMB < minFileSize) {
        return {
            valid: false,
            reason: `File size (${fileSizeInMB.toFixed(
                2
            )} MB) is less than the minimum allowed size (${minFileSize} MB)`,
            constraint: 'MIN_SIZE',
            details: { minSize: minFileSize, actualSize: fileSizeInMB },
        };
    }

    if (maxFileSize && fileSizeInMB > maxFileSize) {
        return {
            valid: false,
            reason: `File size (${fileSizeInMB.toFixed(2)} MB) exceeds the maximum allowed size (${maxFileSize} MB)`,
            constraint: 'MAX_SIZE',
            details: { maxSize: maxFileSize, actualSize: fileSizeInMB },
        };
    }

    if (maxTotalFileSize && maxTotalFileSize > 0 && currentTotalSizeInMB + fileSizeInMB > maxTotalFileSize) {
        return {
            valid: false,
            reason: `Total file size (${(currentTotalSizeInMB + fileSizeInMB).toFixed(
                2
            )} MB) would exceed the maximum allowed (${maxTotalFileSize} MB)`,
            constraint: 'MAX_TOTAL_SIZE',
            details: {
                maxTotalSize: maxTotalFileSize,
                currentTotalSize: currentTotalSizeInMB,
                newFileSize: fileSizeInMB,
                resultingTotalSize: currentTotalSizeInMB + fileSizeInMB,
            },
        };
    }

    if (acceptedTypes && !isFileTypeAccepted(file, acceptedTypes)) {
        return {
            valid: false,
            reason: `File type "${file.type}" is not accepted. Allowed types: ${acceptedTypes}`,
            constraint: 'INVALID_TYPE',
            details: {
                allowedTypes: acceptedTypes,
                fileType: file.type,
                fileExtension: getFileExtension(file.name, file.type),
            },
        };
    }

    return { valid: true };
}

function isFileTypeAccepted(file, acceptedTypes) {
    if (!acceptedTypes || !file || !file.type) return !acceptedTypes;

    const acceptedTypesArray = acceptedTypes.split(',').map(type => type.trim().toLowerCase());
    const typeCategory = file.type.split('/')[0] + '/*';

    if (acceptedTypesArray.includes(typeCategory) || acceptedTypesArray.includes(file.type.toLowerCase())) {
        return true;
    }

    const extension = '.' + file.name.split('.').pop().toLowerCase();
    return acceptedTypesArray.includes(extension);
}

export function getFileExtension(filename, mimeType) {
    if (filename && filename.includes('.')) {
        return filename.split('.').pop().toLowerCase();
    }

    if (mimeType) {
        const mimeExtensions = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/webp': 'webp',
            'application/pdf': 'pdf',
            'text/csv': 'csv',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/json': 'json',
            'text/plain': 'txt',
        };

        return mimeExtensions[mimeType] || mimeType.split('/').pop();
    }

    return '';
}
