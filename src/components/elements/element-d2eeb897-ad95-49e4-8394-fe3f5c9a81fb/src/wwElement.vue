<template>
  <div class="ww-datagrid" :class="{ editing: isEditing }" :style="cssVars">
    <ag-grid-vue
      :rowData="rowData"
      :columnDefs="columnDefs"
      :initial-state="initialState"
      :defaultColDef="defaultColDef"
      :domLayout="content.layout === 'auto' ? 'autoHeight' : 'normal'"
      :style="style"
      :rowSelection="rowSelection"
      :selection-column-def="{ pinned: true }"
      :theme="theme"
      :getRowId="getRowId"
      :pagination="content.pagination"
      :paginationPageSize="
        forcedPaginationPageSize
          ? 0
          : paginationPageSizeSelector
          ? paginationPageSizeSelector[0]
          : content.paginationPageSize
      "
      :paginationPageSizeSelector="paginationPageSizeSelector"
      :suppressMovableColumns="!content.movableColumns"
      :columnHoverHighlight="content.columnHoverHighlight"
      :locale-text="localeText"
      enableCellTextSelection
      ensureDomOrder
      :row-drag-managed="true"
      @grid-ready="onGridReady"
      @row-selected="onRowSelected"
      @selection-changed="onSelectionChanged"
      @cell-value-changed="onCellValueChanged"
      @filter-changed="onFilterChanged"
      @sort-changed="onSortChanged"
      @row-clicked="onRowClicked"
      @row-drag-end="onRowDragged"
      @row-drag-enter="onRowDragEnter"
      @column-moved="onColumnMoved"
      @pagination-changed="onPaginationChanged"
    >
    </ag-grid-vue>
  </div>
</template>

<script>
import {
  shallowRef,
  watchEffect,
  computed,
  inject,
  watch,
  nextTick,
  ref,
} from "vue";
import { AgGridVue } from "ag-grid-vue3";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
} from "ag-grid-community";
import {
  AG_GRID_LOCALE_EN,
  AG_GRID_LOCALE_FR,
  AG_GRID_LOCALE_DE,
  AG_GRID_LOCALE_ES,
  AG_GRID_LOCALE_PT,
} from "@ag-grid-community/locale";
import ActionCellRenderer from "./components/ActionCellRenderer.vue";
import ImageCellRenderer from "./components/ImageCellRenderer.vue";
import WewebCellRenderer from "./components/WewebCellRenderer.vue";

// TODO: maybe register less modules
// TODO: maybe register modules per grid instead of globally
ModuleRegistry.registerModules([AllCommunityModule]);

export default {
  components: {
    AgGridVue,
    ActionCellRenderer,
    ImageCellRenderer,
    WewebCellRenderer,
  },
  props: {
    content: {
      type: Object,
      required: true,
    },
    uid: {
      type: String,
      required: true,
    },
  },
  emits: ["trigger-event", "update:content:effect"],
  setup(props, ctx) {
    const { resolveMappingFormula } = wwLib.wwFormula.useFormula();

    const gridApi = shallowRef(null);
    const { value: selectedRows, setValue: setSelectedRows } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "selectedRows",
        type: "array",
        defaultValue: [],
        readonly: true,
      });
    const { value: filterValue, setValue: setFilters } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "filters",
        type: "object",
        defaultValue: {},
        readonly: true,
      });
    const { value: sortValue, setValue: setSort } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "sort",
        type: "object",
        defaultValue: {},
        readonly: true,
      });
    const { value: columnOrder, setValue: setColumnOrder } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "columnOrder",
        type: "array",
        defaultValue: [],
        readonly: true,
      });

    const { value: data, setValue: setData } =
      wwLib.wwVariable.useComponentVariable({
        uid: props.uid,
        name: "data",
        type: "object",
        defaultValue: {
          allData: [],
          total: 0,
          sortedFilteredData: [],
          totalSortedFilteredData: 0,
          perPageTotal: 0,
          totalPages: 0,
          displayedData: [],
          totalDisplayedRecords: 0,
        },
        readonly: true,
      });

    const onGridReady = (params) => {
      gridApi.value = params.api;
      const columns = params.api.getAllGridColumns();
      setColumnOrder(columns.map((col) => col.getColId()));
    };

    let initialFilter = "";
    let initialSort = "";

    watchEffect(() => {
      // Both initial filters and sort should be set here to avoid conflicts with column state application
      // We keep track of previous values to avoid reinitializing one when only the other changes
      if (!gridApi.value) return;
      if (
        props.content.initialFilters &&
        initialFilter !== JSON.stringify(props.content.initialFilters)
      ) {
        gridApi.value.setFilterModel(props.content.initialFilters);
        initialFilter = JSON.stringify(props.content.initialFilters);
      }
      if (
        props.content.initialSort &&
        initialSort !== JSON.stringify(props.content.initialSort)
      ) {
        gridApi.value.applyColumnState({
          state: props.content.initialSort || [],
          defaultState: { sort: null },
        });
        initialSort = JSON.stringify(props.content.initialSort);
      }
    });

    watchEffect(() => {
      if (!gridApi.value) return;
      if (props.content.initialColumnsOrder) {
        gridApi.value.applyColumnState({
          state: props.content.initialColumnsOrder.map((colId) => ({ colId })),
          applyOrder: true,
        });
      }
    });

    // Wrapper to not compute variables too often
    let rafId = null;
    const scheduleVariableUpdate = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updateVariables();
      });
    };

    function updateVariables() {
      if (!gridApi.value) return;

      const dataValue = {
        allData: data.value.allData,
        total: data.value.total,
      };

      const sortedFiltered = [];
      gridApi.value.forEachNodeAfterFilterAndSort((node) => {
        sortedFiltered.push(node.data);
      });
      dataValue.sortedFilteredData = sortedFiltered;
      dataValue.totalSortedFilteredData = sortedFiltered.length;

      let displayed = [];
      if (props.content.pagination) {
        const pageSize = gridApi.value.paginationGetPageSize();
        dataValue.perPageTotal = pageSize;
        dataValue.totalPages = gridApi.value.paginationGetTotalPages();
        const page = gridApi.value.paginationGetCurrentPage();
        const totalDisplayed = gridApi.value.getDisplayedRowCount();
        const start = page * pageSize;
        const end = Math.min(start + pageSize, totalDisplayed);

        for (let i = start; i < end; i++) {
          const node = gridApi.value.getDisplayedRowAtIndex(i);
          displayed.push(node.data);
        }
      } else {
        displayed = sortedFiltered;
      }

      dataValue.displayedData = displayed;
      dataValue.totalDisplayedRecords = displayed.length;

      setData(dataValue);
    }

    const rowData = computed(() => {
      const data = wwLib.wwUtils.getDataFromCollection(props.content.rowData);
      return Array.isArray(data) ? data ?? [] : [];
    });

    watch(
      rowData,
      (newVal) => {
        const dataValue = { ...data.value };
        dataValue.allData = newVal;
        dataValue.total = newVal.length;
        setData(dataValue);
        scheduleVariableUpdate();
      },
      { immediate: true, deep: true }
    );

    const initialState = computed(() => {
      const state = {
        partialColumnState: true,
      };
      if (props.content.initialFilters) {
        state.filter = { filterModel: props.content.initialFilters };
      }
      if (props.content.initialSort) {
        state.sort = { sortModel: props.content.initialSort };
      }
      if (props.content.initialColumnsOrder) {
        state.columnOrder = {
          orderedColIds: props.content.initialColumnsOrder,
        };
      }
      return state;
    });

    const onRowSelected = (event) => {
      const name = event.node.isSelected() ? "rowSelected" : "rowDeselected";
      ctx.emit("trigger-event", {
        name,
        event: { row: event.data },
      });
    };

    const onRowDragged = (event) => {
      const rows = [];
      event.api.forEachNode((node) => {
        rows.push(node.data);
      });
      ctx.emit("trigger-event", {
        name: "rowDragged",
        event: {
          row: event.node.data,
          id: event.node.id,
          targetIndex: event.overIndex,
          rows,
        },
      });
    };

    const onRowDragEnter = (event) => {
      ctx.emit("trigger-event", {
        name: "rowDragStart",
        event: {
          row: event.node.data,
          id: event.node.id,
        },
      });
    };

    const onSelectionChanged = (event) => {
      if (!gridApi.value) return;
      const selected = gridApi.value.getSelectedRows() || [];
      setSelectedRows(selected);
    };

    const onFilterChanged = (event) => {
      if (!gridApi.value) return;
      const filterModel = gridApi.value.getFilterModel();
      if (
        JSON.stringify(filterModel || {}) !==
        JSON.stringify(filterValue.value || {})
      ) {
        setFilters(filterModel);
        ctx.emit("trigger-event", {
          name: "filterChanged",
          event: filterModel,
        });
        scheduleVariableUpdate();
      }
    };

    const onSortChanged = (event) => {
      if (!gridApi.value) return;
      const state = gridApi.value.getState();
      if (
        JSON.stringify(state.sort?.sortModel || []) !==
        JSON.stringify(sortValue.value || [])
      ) {
        setSort(state.sort?.sortModel || []);
        ctx.emit("trigger-event", {
          name: "sortChanged",
          event: state.sort?.sortModel || [],
        });
        scheduleVariableUpdate();
      }
    };

    const onColumnMoved = (event) => {
      if (!event.finished || event.source !== "uiColumnMoved") return;
      const columns = event.api.getAllGridColumns();
      setColumnOrder(columns.map((col) => col.getColId()));
      ctx.emit("trigger-event", {
        name: "columnMoved",
        event: {
          toIndex: event.toIndex,
          columnId: event.column.getColId(),
          columnsOrder: columns.map((col) => col.getColId()),
        },
      });
    };

    const onPaginationChanged = (event) => {
      scheduleVariableUpdate();
    };

    watch(
      () => props.content.pagination,
      () => {
        scheduleVariableUpdate();
      }
    );


    // Hack to force pagination page size update when changing pagination selector mode
    const forcedPaginationPageSize = ref(false);
    watch(
      () => props.content.hasPaginationSelector,
      (newVal, oldVal) => {
        if (oldVal === "multiple" && newVal !== "multiple") {
          forcedPaginationPageSize.value = true;
          nextTick().then(() => {
            forcedPaginationPageSize.value = false;
          });
        }
      }
    );

    function refreshData() {
      nextTick(() => {
        gridApi.value?.refreshCells();
      });
    }

    return {
      resolveMappingFormula,
      onGridReady,
      onRowSelected,
      onSelectionChanged,
      gridApi,
      onFilterChanged,
      onSortChanged,
      onPaginationChanged,
      localeText: computed(() => {
        switch (props.content.lang) {
          case "fr":
            return AG_GRID_LOCALE_FR;
          case "de":
            return AG_GRID_LOCALE_DE;
          case "es":
            return AG_GRID_LOCALE_ES;
          case "pt":
            return AG_GRID_LOCALE_PT;
          case "custom":
            return {
              ...AG_GRID_LOCALE_EN,
              ...(props.content.localeText || {}),
            };
          default:
            AG_GRID_LOCALE_EN;
        }
      }),
      forcedPaginationPageSize,
      onRowDragged,
      onRowDragEnter,
      onColumnMoved,
      initialState,
      refreshData,
      rowData,
    };
  },
  computed: {
    defaultColDef() {
      return {
        editable: false,
        resizable: this.content.resizableColumns,
        autoHeaderHeight: this.content.headerHeightMode === "auto",
        wrapHeaderText: this.content.headerHeightMode === "auto",
        cellClass:
          this.content.cellAlignmentMode === "custom"
            ? `-${this.content.cellAlignment || "left"} ||`
            : null,
      };
    },
    columnDefs() {
      const columns = this.content.columns.map((col, index) => {
        const minWidth =
          !col?.minWidth || col?.minWidth === "auto"
            ? null
            : wwLib.wwUtils.getLengthUnit(col?.minWidth)?.[0];
        const maxWidth =
          !col?.maxWidth || col?.maxWidth === "auto"
            ? null
            : wwLib.wwUtils.getLengthUnit(col?.maxWidth)?.[0];
        const width =
          !col?.width || col?.width === "auto" || col?.widthAlgo === "flex"
            ? null
            : wwLib.wwUtils.getLengthUnit(col?.width)?.[0];
        const flex = col?.widthAlgo === "flex" ? col?.flex ?? 1 : null;
        const commonProperties = {
          minWidth,
          maxWidth,
          pinned: col?.pinned === "none" ? false : col?.pinned,
          width,
          flex,
          hide: !!col?.hide,
          headerClass: col.headerAlignment ? `-${col.headerAlignment}` : null,
          ...(this.content.cellAlignmentMode !== "custom"
            ? { cellClass: col.cellAlignment ? `-${col.cellAlignment}` : null }
            : {}),
        };
        switch (col?.cellDataType) {
          case "action": {
            return {
              ...commonProperties,
              headerName: col?.headerName,
              cellRenderer: "ActionCellRenderer",
              cellRendererParams: {
                name: col?.actionName,
                label: col?.actionLabel,
                trigger: this.onActionTrigger,
                withFont: !!this.content.actionFont,
              },
              sortable: false,
              filter: false,
              colId: col?.actionName,
            };
          }
          case "custom":
            return {
              ...commonProperties,
              headerName: col?.headerName,
              field: col?.field,
              cellRenderer: "WewebCellRenderer",
              cellRendererParams: {
                containerId: col?.containerId,
              },
              sortable: col?.sortable,
              filter: col?.filter,
            };
          case "image": {
            return {
              ...commonProperties,
              headerName: col?.headerName,
              field: col?.field,
              cellRenderer: "ImageCellRenderer",
              cellRendererParams: {
                width: col?.imageWidth,
                height: col?.imageHeight,
              },
            };
          }
          default: {
            const result = {
              ...commonProperties,
              headerName: col?.headerName,
              field: col?.field,
              sortable: col?.sortable,
              filter: col?.filter,
              editable: col?.editable,
            };
            if (col?.useCustomLabel) {
              result.valueFormatter = (params) => {
                return this.resolveMappingFormula(
                  col?.displayLabelFormula,
                  params.value
                );
              };
            }
            return result;
          }
        }
      });

      if (this.content.rowReorder && columns[0]) {
        columns[0].rowDrag = true;
      }

      return columns;
    },
    rowSelection() {
      if (this.content.rowSelection === "multiple") {
        return {
          mode: "multiRow",
          checkboxes: !this.content.disableCheckboxes,
          headerCheckbox: !this.content.disableCheckboxes,
          selectAll: this.content.selectAll || "all",
          enableClickSelection: this.content.enableClickSelection,
        };
      } else if (this.content.rowSelection === "single") {
        return {
          mode: "singleRow",
          checkboxes: !this.content.disableCheckboxes,
          enableClickSelection: this.content.enableClickSelection,
        };
      } else {
        return {
          mode: "singleRow",
          checkboxes: false,
          isRowSelectable: () => false,
          enableClickSelection: this.content.enableClickSelection,
        };
      }
    },
    style() {
      if (this.content.layout === "auto") return {};
      return {
        height: this.content.height || "400px",
      };
    },
    cssVars() {
      return {
        "--ww-data-grid_action-backgroundColor":
          this.content.actionBackgroundColor,
        "--ww-data-grid_action-color": this.content.actionColor,
        "--ww-data-grid_action-padding": this.content.actionPadding,
        "--ww-data-grid_action-border": this.content.actionBorder,
        "--ww-data-grid_action-borderRadius": this.content.actionBorderRadius,
        ...(this.content.actionFont
          ? { "--ww-data-grid_action-font": this.content.actionFont }
          : {
              "--ww-data-grid_action-fontSize": this.content.actionFontSize,
              "--ww-data-grid_action-fontFamily": this.content.actionFontFamily,
              "--ww-data-grid_action-fontWeight": this.content.actionFontWeight,
              "--ww-data-grid_action-fontStyle": this.content.actionFontStyle,
              "--ww-data-grid_action-lineHeight": this.content.actionLineHeight,
            }),
      };
    },
    theme() {
      return themeQuartz.withParams({
        headerBackgroundColor: this.content.headerBackgroundColor,
        headerTextColor: this.content.headerTextColor,
        headerFontSize: this.content.headerFontSize,
        headerFontFamily: this.content.headerFontFamily,
        headerFontWeight: this.content.headerFontWeight,
        headerHeight:
          this.content.headerHeightMode !== "auto"
            ? this.content.headerHeight
            : undefined,
        borderColor: this.content.borderColor,
        cellTextColor: this.content.cellColor,
        cellFontFamily: this.content.cellFontFamily,
        dataFontSize: this.content.cellFontSize,
        oddRowBackgroundColor: this.content.rowAlternateColor,
        backgroundColor: this.content.rowBackgroundColor,
        rowHoverColor: this.content.rowHoverColor,
        selectedRowBackgroundColor: this.content.selectedRowBackgroundColor,
        rowVerticalPaddingScale: this.content.rowVerticalPaddingScale || 1,
        menuBackgroundColor: this.content.menuBackgroundColor,
        menuTextColor: this.content.menuTextColor,
        columnHoverColor: this.content.columnHoverColor,
        foregroundColor: this.content.textColor,
        checkboxCheckedBackgroundColor: this.content.selectionCheckboxColor,
        rangeSelectionBorderColor: this.content.cellSelectionBorderColor,
        checkboxUncheckedBorderColor: this.content.checkboxUncheckedBorderColor,
        focusShadow: this.content.focusShadow?.length
          ? this.content.focusShadow
          : undefined,
        wrapperBorderRadius: this.content.wrapperBorderRadius,
      });
    },
    isEditing() {
      // eslint-disable-next-line no-unreachable
      return false;
    },
    paginationPageSizeSelector() {
      if (
        !this.content.pagination ||
        this.content.hasPaginationSelector !== "multiple"
      ) {
        return false;
      }
      if (
        !Array.isArray(this.content.paginationPageSizeSelector) ||
        this.content.paginationPageSizeSelector.length === 0
      ) {
        return false;
      }
      return this.content.paginationPageSizeSelector;
    },
  },
  methods: {
    getRowId(params) {
      return this.resolveMappingFormula(this.content.idFormula, params.data);
    },
    onActionTrigger(event) {
      this.$emit("trigger-event", {
        name: "action",
        event,
      });
    },
    onCellValueChanged(event) {
      this.$emit("trigger-event", {
        name: "cellValueChanged",
        event: {
          oldValue: event.oldValue,
          newValue: event.newValue,
          columnId: event.column.getColId(),
          row: event.data,
        },
      });
    },
    onRowClicked(event) {
      this.$emit("trigger-event", {
        name: "rowClicked",
        event: {
          row: event.data,
          id: event.node.id,
          index: event.node.sourceRowIndex,
          displayIndex: event.rowIndex,
        },
      });
    },
    resetFilters() {
      if (!this.gridApi) return;
      this.gridApi.setFilterModel(null);
    },
    resetSort() {
      if (!this.gridApi) return;
      this.gridApi.applyColumnState({
        state: [],
        defaultState: { sort: null },
      });
    },
    deselectAll() {
      if (!this.gridApi) return;
      this.gridApi.deselectAll();
    },
    selectAll(mode) {
      if (!this.gridApi) return;
      if (this.content.rowSelection !== "multiple") {
        wwLib.logStore.warning(
          "Select all will have no effect, as row selection is not set to multiple"
        );
        return;
      }
      this.gridApi.selectAll(mode || this.content.selectAll || "all");
    },
    selectRow(rowId) {
      if (!this.gridApi) return;
      const rowNode = this.gridApi.getRowNode(rowId);
      if (rowNode) {
        rowNode.setSelected(true);
      }
    },
    deselectRow(rowId) {
      if (!this.gridApi) return;
      const rowNode = this.gridApi.getRowNode(rowId);
      if (rowNode) {
        rowNode.setSelected(false);
      }
    },
  },
};
</script>

<style scoped lang="scss">
.ww-datagrid {
  position: relative;
  :deep(.ag-cell-wrapper),
  :deep(.ag-cell-value) {
    height: 100%;
  }
  :deep(.ag-header-cell) {
    &.-center .ag-header-cell-label {
      justify-content: center;
    }
    &.-right {
      .ag-header-cell-label {
        justify-content: flex-end;
      }
      .ag-header-cell-filter-button {
        margin-left: 4px;
      }
    }
    &.-left .ag-header-cell-label {
      justify-content: flex-start;
    }
  }
  :deep(.ag-cell) {
    .ag-cell-value {
      display: flex;
    }

    &.-right {
      .ag-cell-value {
        justify-content: flex-end;
      }
    }
    &.-center {
      .ag-cell-value {
        justify-content: center;
      }
    }
    &.-left {
      .ag-cell-value {
        justify-content: flex-start;
      }
    }
  }
}
</style>
