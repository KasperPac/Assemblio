export default {
  editor: {
    label: {
      en: "Dropdown",
    },
    icon: "navigator-dropdown",
    navigator: {
      groups: ["Trigger", "Dropdown"],
    },
  },
  actions: [{ label: 'Close dropdown', action: 'closeDropdown' }],
  properties: {
    triggerType: {
      label: {
        en: "Trigger",
      },
      type: "TextSelect",
      defaultValue: "click",
      options: {
        options: [
          { value: "click", label: { en: "Click" } },
          { value: "hover", label: { en: "Hover" } },
          { value: "right-click", label: { en: "Right click" } }
        ],
      },
      bindable: true,
      classes: true,
      states: true,
      bindingValidation: {
        type: 'string',
        tooltip: 'A string that defines the trigger type of the dropdown. Possible values are click, hover, and right-click.',
      }
    },
    position: {
      label: {
        en: "Position",
      },
      type: "TextSelect",
      defaultValue: "bottom",
      options: {
        options: [
          { value: "top", label: { en: "Top" } },
          { value: "right", label: { en: "Right" } },
          { value: "bottom", label: { en: "Bottom" } },
          { value: "left", label: { en: "Left" } },
        ],
      },
      bindable: true,
      classes: true,
      states: true,
      responsive: true,
      bindingValidation: {
        type: 'string',
        tooltip: 'A string that defines the position of the dropdown. Possible values are top, right, bottom, and left.',
      }
    },
    alignment: {
      label: { en: "Align" },
      type: "TextRadioGroup",
      options: (content) => {
        if (content.position === "top" || content.position === "bottom") {
          return {
            choices: [
              {
                value: "start",
                title: { en: "Start" },
                icon: "align-left",
              },
              {
                value: "center",
                title: { en: "Center" },
                icon: "align-center",
              },
              { value: "end", title: { en: "End" }, icon: "align-right" },
            ],
          };
        } else {
          return {
            choices: [
              {
                value: "start",
                title: { en: "Start" },
                icon: "align-y-start",
              },
              {
                value: "center",
                title: { en: "Center" },
                icon: "align-y-center",
              },
              { value: "end", title: { en: "End" }, icon: "align-y-end" },
            ],
          };
        }
      },
      defaultValue: "start",
      bindable: true,
      classes: true,
      states: true,
      responsive: true,
      bindingValidation: {
        type: 'string',
        tooltip: 'A string that defines the alignment of the dropdown. Possible values are start, center, and end.',
      }
    },
    offsetX: {
      type: "Length",
      label: {
        en: "Offset (x)",
        fr: "Taille",
      },
      bindable: true,
      options: {
        unitChoices: [
          { value: "px", label: "px", min: 1, max: 1000 },
          { value: "%", label: "%", min: 1, max: 100 },
        ],
        noRange: true,
        useVar: true,
      },
      bindingValidation: {
        type: 'string',
        tooltip: 'A string that defines size of offset in px or %',
      }
    },
    offsetY: {
      type: "Length",
      label: {
        en: "Offset (y)",
        fr: "Taille",
      },
      bindable: true,
      options: {
        unitChoices: [
          { value: "px", label: "px", min: 1, max: 1000 },
          { value: "%", label: "%", min: 1, max: 100 },
        ],
        noRange: true,
        useVar: true,
      },
      bindingValidation: {
        type: 'string',
        tooltip: 'A string that defines size of offset in px or %',
      }
    },
    triggerLayout: {
      hidden: true,
      defaultValue: [],
      navigator: {
        group: "Trigger",
      },
    },
    dropdownLayout: {
      hidden: true,
      defaultValue: [],
      navigator: {
        group: "Dropdown",
      },
    },
    dropdownZIndex: {
      label: 'Dropdown z-index',
      type: 'Number',
      options: {
        min: 0,
        max: 100,
      },
      responsive: true,
      states: true,
      classes: true,
      bindable: true,

    },
    disabled: {
      type: "OnOff",
      label: {
        en: "Disabled",
      },
      bindable: true,

    },
    animated: {
      type: "OnOff",
      label: {
        en: "Animated",
      },
      bindable: true,

    },
    forceDisplayEditor: {
      type: "OnOff",
      label: {
        en: "Force display in editor",
      }
    },
  },
};
