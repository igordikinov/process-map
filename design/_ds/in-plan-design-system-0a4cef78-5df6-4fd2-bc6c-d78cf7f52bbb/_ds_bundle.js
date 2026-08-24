/* @ds-bundle: {"format":4,"namespace":"InPlanDesignSystem_0a4cef","components":[{"name":"Button","sourcePath":"components/buttons/Button.jsx"},{"name":"Badge","sourcePath":"components/data/Badge.jsx"},{"name":"ExpandableText","sourcePath":"components/data/ExpandableText.jsx"},{"name":"IndicativeScale","sourcePath":"components/data/Widget.jsx"},{"name":"ScrollContainer","sourcePath":"components/data/ScrollContainer.jsx"},{"name":"Widget","sourcePath":"components/data/Widget.jsx"},{"name":"FormState","sourcePath":"components/feedback/FormState.jsx"},{"name":"Loading","sourcePath":"components/feedback/Loading.jsx"},{"name":"Spinner","sourcePath":"components/feedback/Loading.jsx"},{"name":"Note","sourcePath":"components/feedback/Note.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"FieldError","sourcePath":"components/forms/FormField.jsx"},{"name":"FieldHint","sourcePath":"components/forms/FormField.jsx"},{"name":"FormField","sourcePath":"components/forms/FormField.jsx"},{"name":"FieldShell","sourcePath":"components/forms/Input.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"InputSwitcher","sourcePath":"components/forms/InputSwitcher.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"SlideToggle","sourcePath":"components/forms/SlideToggle.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Icon","sourcePath":"components/icon/Icon.jsx"},{"name":"PageTabs","sourcePath":"components/navigation/PageTabs.jsx"},{"name":"Dialog","sourcePath":"components/overlay/Dialog.jsx"},{"name":"Drawer","sourcePath":"components/overlay/Drawer.jsx"},{"name":"Tooltip","sourcePath":"components/overlay/Tooltip.jsx"}],"sourceHashes":{"components/buttons/Button.jsx":"1539b1d1ff0c","components/data/Badge.jsx":"002fb24cf885","components/data/ExpandableText.jsx":"0800302d7d78","components/data/IndicativeScale.jsx":"a725e6a0df10","components/data/ScrollContainer.jsx":"30b4f0d9ea39","components/data/Widget.jsx":"deed62e12373","components/feedback/FormState.jsx":"b78779d36b82","components/feedback/Loading.jsx":"656a9c67981c","components/feedback/Note.jsx":"83a3eac86074","components/forms/Checkbox.jsx":"c1f868e5e1b3","components/forms/FieldError.jsx":"50612a22f53a","components/forms/FieldHint.jsx":"90904f720d8d","components/forms/FormField.jsx":"4e35f860dc80","components/forms/Input.jsx":"292cf7e1b262","components/forms/InputSwitcher.jsx":"4c3e9a2b2c60","components/forms/Radio.jsx":"4e25019cb141","components/forms/Select.jsx":"4ccc4efa29b5","components/forms/SlideToggle.jsx":"e3a23d0d6826","components/forms/Textarea.jsx":"34de4c4142e3","components/icon/Icon.jsx":"c4d74b45f368","components/navigation/PageTabs.jsx":"2e8eef3ae7b5","components/overlay/Dialog.jsx":"5950e53e619c","components/overlay/Drawer.jsx":"c2d5b498dc6d","components/overlay/Tooltip.jsx":"4d598fe78ad6","ui_kits/scp-shell/GridScreen.jsx":"f521bd4847b6","ui_kits/scp-shell/Header.jsx":"0c7cbbaa7b26","ui_kits/scp-shell/HomeScreen.jsx":"539ea248129a","ui_kits/scp-shell/Sidebar.jsx":"3468173f47ec","ui_kits/scp-shell/app.jsx":"9587b0e3983a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.InPlanDesignSystem_0a4cef = window.InPlanDesignSystem_0a4cef || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/buttons/Button.jsx
try { (() => {
const CSS = `
.scp-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:var(--scp-radius-button,4px);font-family:'Open Sans',sans-serif;font-weight:600;cursor:pointer;border:1px solid transparent;transition:background-color .2s,color .2s,border-color .2s;white-space:nowrap;background:none;text-decoration:none}
.scp-btn:disabled{cursor:default}
.scp-btn--lg{height:48px;font-size:18px;padding:0 16px}
.scp-btn--md{height:40px;font-size:14px;padding:0 16px}
.scp-btn--sm{height:32px;font-size:14px;padding:0 12px}
.scp-btn--xs{height:24px;font-size:12px;padding:0 8px}
.scp-btn--icon{padding:0}
.scp-btn--icon.scp-btn--lg{width:48px}
.scp-btn--icon.scp-btn--md{width:40px}
.scp-btn--icon.scp-btn--sm{width:32px}
.scp-btn--icon.scp-btn--xs{width:24px}
.scp-btn--full{width:100%}
.scp-btn--flat.scp-btn--primary{background:var(--scp-background-action-brand-primary-default);color:#fff}
.scp-btn--flat.scp-btn--primary:hover:not(:disabled){background:var(--scp-background-action-brand-primary-hover)}
.scp-btn--flat.scp-btn--primary:active:not(:disabled){background:var(--scp-background-action-brand-primary-active)}
.scp-btn--flat.scp-btn--sub-primary{background:var(--scp-background-action-neutral-secondary-default);color:var(--scp-main-font-color)}
.scp-btn--flat.scp-btn--sub-primary:hover:not(:disabled){background:var(--scp-background-action-neutral-secondary-hover)}
.scp-btn--flat.scp-btn--sub-primary:active:not(:disabled){background:var(--scp-background-action-neutral-secondary-active)}
.scp-btn--flat.scp-btn--sub-primary-text{background:var(--scp-background-action-brand-tertiary-default);color:var(--scp-primary-color)}
.scp-btn--flat.scp-btn--sub-primary-text:hover:not(:disabled){background:var(--scp-background-action-brand-tertiary-hover)}
.scp-btn--flat.scp-btn--sub-primary-text:active:not(:disabled){background:var(--scp-background-action-brand-tertiary-active)}
.scp-btn--flat.scp-btn--sub-primary-color{background:var(--scp-background-action-neutral-secondary-default);color:var(--scp-primary-color)}
.scp-btn--flat.scp-btn--sub-primary-color:hover:not(:disabled){background:var(--scp-background-action-brand-tertiary-hover)}
.scp-btn--flat.scp-btn--sub-primary-color:active:not(:disabled){background:var(--scp-background-action-brand-tertiary-active)}
.scp-btn--flat.scp-btn--sub-secondary-text{background:var(--scp-background-action-brand-tertiary-default);color:var(--scp-main-font-color)}
.scp-btn--flat.scp-btn--sub-secondary-text:hover:not(:disabled){background:var(--scp-background-action-neutral-secondary-hover)}
.scp-btn--flat.scp-btn--warn{background:var(--scp-background-action-destructive-default);color:#fff}
.scp-btn--flat.scp-btn--warn:hover:not(:disabled){background:var(--scp-background-action-destructive-hover)}
.scp-btn--flat.scp-btn--warn:active:not(:disabled){background:var(--scp-background-action-destructive-active)}
.scp-btn--flat:disabled,.scp-btn--icon-flat:disabled{background:var(--scp-background-action-brand-primary-disable);color:var(--scp-text-neutral-disable)}
.scp-btn--stroked{background:#fff}
.scp-btn--stroked.scp-btn--primary{border-color:var(--scp-border-brand-default);color:var(--scp-primary-color)}
.scp-btn--stroked.scp-btn--primary:hover:not(:disabled){background:var(--scp-background-action-brand-outline-hover)}
.scp-btn--stroked.scp-btn--primary:active:not(:disabled){background:var(--scp-background-action-brand-outline-active)}
.scp-btn--stroked.scp-btn--sub-primary,.scp-btn--stroked.scp-btn--sub-secondary-text{border-color:var(--scp-neutral-default-border);color:var(--scp-main-font-color)}
.scp-btn--stroked.scp-btn--sub-primary:hover:not(:disabled){background:var(--scp-background-action-neutral-secondary-default)}
.scp-btn--stroked.scp-btn--warn{border-color:var(--scp-border-error-default);color:var(--scp-background-action-destructive-default)}
.scp-btn--stroked:disabled{border-color:var(--scp-border-neutral-disable);color:var(--scp-text-neutral-disable);background:#fff}
.scp-btn--link{padding:0;height:auto;font-weight:400;color:inherit}
.scp-btn--link:hover:not(:disabled){color:var(--scp-primary-color)}
.scp-btn--link.scp-btn--sub-primary-text{color:var(--scp-primary-color)}
.scp-btn--link:disabled{color:var(--scp-text-neutral-disable)}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-btn-css')) {
  const s = document.createElement('style');
  s.id = 'scp-btn-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Button({
  children,
  color = 'primary',
  modifier = 'flat',
  size = 'md',
  disabled,
  fullWidth,
  onClick,
  type = 'button',
  title,
  style,
  className
}) {
  const icon = modifier === 'icon-flat' || modifier === 'icon-stroked' || modifier === 'icon';
  const base = modifier === 'icon-flat' || modifier === 'icon' ? 'flat' : modifier === 'icon-stroked' ? 'stroked' : modifier;
  const cls = ['scp-btn', `scp-btn--${base}`, `scp-btn--${size}`, `scp-btn--${color}`, icon && 'scp-btn--icon', modifier === 'icon-flat' && 'scp-btn--icon-flat', fullWidth && 'scp-btn--full', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", {
    type: type,
    className: cls,
    disabled: disabled,
    onClick: onClick,
    title: title,
    style: style
  }, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/buttons/Button.jsx", error: String((e && e.message) || e) }); }

// components/data/Badge.jsx
try { (() => {
function Badge({
  children,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: className,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--scp-badge-bg)',
      color: 'var(--scp-badge-color)',
      font: 'var(--scp-badge-font)',
      borderRadius: 'var(--scp-badge-border-radius,9999px)',
      minHeight: 'var(--scp-badge-size,24px)',
      minWidth: 'var(--scp-badge-size,24px)',
      padding: 'var(--scp-badge-padding,0 8px)',
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Badge.jsx", error: String((e && e.message) || e) }); }

// components/data/ExpandableText.jsx
try { (() => {
function ExpandableText({
  title,
  children,
  expanded: initial = false,
  style,
  className
}) {
  const [expanded, setExpanded] = React.useState(initial);
  return /*#__PURE__*/React.createElement("div", {
    style: style,
    className: className
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 5,
      minHeight: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      flexGrow: 1
    }
  }, title), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    size: "xs",
    color: "sub-primary-text",
    onClick: () => setExpanded(v => !v),
    style: {
      flexShrink: 0,
      marginRight: 20
    }
  }, expanded ? 'Свернуть' : 'Подробнее')), expanded && /*#__PURE__*/React.createElement("div", null, children));
}
Object.assign(__ds_scope, { ExpandableText });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ExpandableText.jsx", error: String((e && e.message) || e) }); }

// components/data/ScrollContainer.jsx
try { (() => {
const CSS = `
.scp-scroll{overflow:auto}
.scp-scroll::-webkit-scrollbar{width:var(--scp-scrollbar-size,8px);height:var(--scp-scrollbar-size,8px)}
.scp-scroll::-webkit-scrollbar-thumb{background-color:var(--scp-scrollbar-thumb-color,#d9d9d9);border-radius:var(--scp-scrollbar-border-radius,8px);background-clip:padding-box}
.scp-scroll::-webkit-scrollbar-track{background-color:transparent}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-scroll-css')) {
  const s = document.createElement('style');
  s.id = 'scp-scroll-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function ScrollContainer({
  children,
  height,
  maxHeight,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `scp-scroll ${className || ''}`,
    style: {
      height,
      maxHeight,
      ...style
    }
  }, children);
}
Object.assign(__ds_scope, { ScrollContainer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ScrollContainer.jsx", error: String((e && e.message) || e) }); }

// components/data/Widget.jsx
try { (() => {
function rangeColor(percent, colorRanges) {
  if (!colorRanges || !colorRanges.length) return 'var(--scp-widget-color-secondary)';
  const r = colorRanges.find(r => percent >= r.from && (r.to === undefined || percent < r.to)) || colorRanges[colorRanges.length - 1];
  return {
    error: 'var(--scp-widget-color-danger)',
    warning: 'var(--scp-widget-color-secondary)',
    success: 'var(--scp-widget-color-primary)'
  }[r.type] || 'var(--scp-widget-color-secondary)';
}
function IndicativeScale({
  value = 0,
  min = 0,
  max = 100,
  orientation = 'horizontal',
  colorRanges,
  percent,
  style
}) {
  const p = percent !== undefined ? percent : Math.max(0, Math.min(100, (value - min) / (max - min || 1) * 100));
  const color = rangeColor(p, colorRanges);
  const horiz = orientation === 'horizontal';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      display: 'flex',
      border: '1px solid var(--scp-widget-color-border-dark)',
      background: 'var(--scp-widget-color-background-scale)',
      width: horiz ? '100%' : 'var(--scp-widget-size-scale-thickness,8px)',
      height: horiz ? 'var(--scp-widget-size-scale-thickness,8px)' : '100%',
      boxSizing: 'content-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      bottom: 0,
      background: color,
      transition: 'width .3s,height .3s',
      width: horiz ? p + '%' : '100%',
      height: horiz ? '100%' : p + '%'
    }
  }));
}
function Widget({
  mode = 'standard',
  orientation = 'horizontal',
  size = 'full',
  title,
  value,
  min = 0,
  max = 100,
  showMinMaxLabels = true,
  colorRanges,
  footer,
  width,
  height,
  style,
  className
}) {
  const percent = Math.max(0, Math.min(100, (value - min) / (max - min || 1) * 100));
  const vertical = mode === 'indicative' && orientation === 'vertical';
  const label = {
    fontSize: 'var(--scp-widget-label-font-size,14px)',
    color: 'var(--scp-widget-color-text-light)',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  };
  const big = {
    fontSize: size === 'compact' ? 18 : 24,
    fontWeight: 700,
    color: 'var(--scp-content-primary)'
  };
  const minmax = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--scp-widget-color-text-light)'
  };
  const trendType = colorRanges ? (r => r ? r.type : null)(colorRanges.find(r => percent >= r.from && (r.to === undefined || percent < r.to))) : percent >= 50 ? 'success' : 'error';
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      background: 'var(--scp-widget-color-background,#fff)',
      borderRadius: 'var(--scp-widget-size-border-radius,8px)',
      boxShadow: 'var(--scp-widget-shadow-default)',
      border: '1px solid var(--scp-widget-color-border)',
      padding: size === 'compact' ? 'var(--scp-widget-size-padding-medium,8px)' : 'var(--scp-widget-size-padding-large,16px)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--scp-widget-size-gap-medium,8px)',
      width: width || (vertical ? 120 : size === 'compact' ? 180 : 260),
      height,
      fontFamily: "'Open Sans',sans-serif",
      boxSizing: 'border-box',
      ...style
    }
  }, vertical ? /*#__PURE__*/React.createElement(React.Fragment, null, title && /*#__PURE__*/React.createElement("div", {
    style: label,
    title: title
  }, title), /*#__PURE__*/React.createElement("div", {
    style: big
  }, value), showMinMaxLabels && /*#__PURE__*/React.createElement("span", {
    style: minmax
  }, "MAX ", max), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 80,
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(IndicativeScale, {
    value: value,
    min: min,
    max: max,
    orientation: "vertical",
    colorRanges: colorRanges
  })), showMinMaxLabels && /*#__PURE__*/React.createElement("span", {
    style: minmax
  }, "MIN ", min)) : mode === 'indicative' ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: 8
    }
  }, title && /*#__PURE__*/React.createElement("div", {
    style: label,
    title: title
  }, title), /*#__PURE__*/React.createElement("div", {
    style: big
  }, value)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(IndicativeScale, {
    value: value,
    min: min,
    max: max,
    colorRanges: colorRanges
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      fontWeight: 600
    }
  }, Math.round(percent * 100) / 100, "%")), showMinMaxLabels && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: minmax
  }, "MIN ", min), /*#__PURE__*/React.createElement("span", {
    style: minmax
  }, "MAX ", max))) : mode === 'comparative' ? /*#__PURE__*/React.createElement(React.Fragment, null, title && /*#__PURE__*/React.createElement("div", {
    style: label,
    title: title
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: big
  }, Math.round(percent * 100) / 100, "%"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: trendType === 'success' ? 'var(--scp-widget-color-primary)' : trendType === 'error' ? 'var(--scp-widget-color-danger)' : 'var(--scp-widget-color-secondary)',
      fontSize: 18,
      fontWeight: 700,
      lineHeight: 1
    }
  }, trendType === 'success' ? '↗' : trendType === 'error' ? '↘' : '-'))) : /*#__PURE__*/React.createElement(React.Fragment, null, title && /*#__PURE__*/React.createElement("div", {
    style: label,
    title: title
  }, title), /*#__PURE__*/React.createElement("div", {
    style: big
  }, value)), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--scp-widget-footer-font-size,12px)',
      color: 'var(--scp-widget-color-text-light)',
      borderTop: '1px solid var(--scp-widget-color-border)',
      paddingTop: 4
    }
  }, footer));
}
Object.assign(__ds_scope, { IndicativeScale, Widget });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Widget.jsx", error: String((e && e.message) || e) }); }

// components/data/IndicativeScale.jsx
try { (() => {

Object.assign(__ds_scope, { IndicativeScale: __ds_scope.IndicativeScale });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/IndicativeScale.jsx", error: String((e && e.message) || e) }); }

// components/feedback/FormState.jsx
try { (() => {
function FormState({
  state,
  title = 'Текущее состояние формы',
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      background: '#f4f4f4',
      padding: 24,
      borderRadius: 8,
      whiteSpace: 'pre-wrap',
      fontFamily: "'Open Sans',sans-serif",
      ...style
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      margin: '0 0 8px',
      fontSize: 20,
      fontWeight: 700
    }
  }, title), /*#__PURE__*/React.createElement("pre", {
    style: {
      margin: 0,
      fontSize: 12,
      lineHeight: '18px'
    }
  }, JSON.stringify(state, null, 2)));
}
Object.assign(__ds_scope, { FormState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/FormState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Loading.jsx
try { (() => {
const CSS = `
.scp-loading{position:absolute;bottom:0;left:0;right:0;height:4px;overflow:hidden;background:var(--scp-accent-background,#f1e0ff)}
.scp-loading__bar{position:absolute;height:100%;width:40%;background:var(--scp-primary-color,#9000ff);animation:scp-loading-slide 1.2s ease-in-out infinite}
@keyframes scp-loading-slide{0%{left:-40%}60%{left:100%}100%{left:100%}}
.scp-spinner{display:inline-block;border-radius:50%;border:3px solid var(--scp-accent-background,#f1e0ff);border-top-color:var(--scp-primary-color,#9000ff);animation:scp-spin .8s linear infinite}
@keyframes scp-spin{to{transform:rotate(360deg)}}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-loading-css')) {
  const s = document.createElement('style');
  s.id = 'scp-loading-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Loading({
  isLoading = true,
  style,
  className
}) {
  if (!isLoading) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: `scp-loading ${className || ''}`,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    className: "scp-loading__bar"
  }));
}
function Spinner({
  size = 40,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `scp-spinner ${className || ''}`,
    style: {
      width: size,
      height: size,
      ...style
    }
  });
}
Object.assign(__ds_scope, { Loading, Spinner });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Loading.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
const CSS = `
.scp-checkbox{display:inline-flex;align-items:center;cursor:pointer;font-size:14px;font-family:'Open Sans',sans-serif;color:var(--scp-content-primary)}
.scp-checkbox--disabled{cursor:default}
.scp-checkbox__box{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--scp-border-neutral-default);border-radius:var(--scp-border-radius-sm,4px);background:#fff;transition:background .12s,border-color .12s;flex-shrink:0}
.scp-checkbox:hover:not(.scp-checkbox--disabled) .scp-checkbox__box{border-color:var(--scp-border-neutral-hover)}
.scp-checkbox--checked .scp-checkbox__box{background:var(--scp-primary-color);border-color:var(--scp-primary-color)}
.scp-checkbox--disabled .scp-checkbox__box{background:var(--scp-background-secondary);border-color:var(--scp-background-secondary)}
.scp-checkbox--disabled.scp-checkbox--checked .scp-checkbox__box svg{stroke:var(--scp-background-disabled)}
.scp-checkbox--invalid .scp-checkbox__box{border-color:var(--scp-form-field-error-color)}
.scp-checkbox--invalid .scp-checkbox__label{color:var(--scp-form-field-error-color)}
.scp-checkbox__label{padding-left:8px}
.scp-checkbox--disabled .scp-checkbox__label{color:var(--scp-text-neutral-disable)}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-checkbox-css')) {
  const s = document.createElement('style');
  s.id = 'scp-checkbox-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Checkbox({
  checked,
  defaultChecked,
  onChange,
  label,
  size = 16,
  disabled,
  invalid,
  indeterminate,
  style,
  className
}) {
  const [inner, setInner] = React.useState(!!defaultChecked);
  const val = checked !== undefined ? checked : inner;
  const cls = ['scp-checkbox', val && 'scp-checkbox--checked', disabled && 'scp-checkbox--disabled', invalid && 'scp-checkbox--invalid', className].filter(Boolean).join(' ');
  const mark = indeterminate ? /*#__PURE__*/React.createElement("svg", {
    width: size * 0.75,
    height: size * 0.75,
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("line", {
    x1: "2",
    y1: "6",
    x2: "10",
    y2: "6"
  })) : /*#__PURE__*/React.createElement("svg", {
    width: size * 0.75,
    height: size * 0.75,
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "#fff",
    strokeWidth: "2"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 6.5L4.7 9.2L10 3.5"
  }));
  return /*#__PURE__*/React.createElement("span", {
    className: cls,
    style: style,
    onClick: () => {
      if (disabled) return;
      const n = !val;
      if (checked === undefined) setInner(n);
      onChange && onChange(n);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "scp-checkbox__box",
    style: {
      width: size,
      height: size
    }
  }, (val || indeterminate) && mark), label != null && /*#__PURE__*/React.createElement("span", {
    className: "scp-checkbox__label"
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/FormField.jsx
try { (() => {
function FieldHint({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--scp-form-field-font)',
      color: 'var(--scp-text-neutral-secondary)',
      padding: '4px var(--scp-form-field-hint-padding,12px) 0',
      ...style
    }
  }, children);
}
function FieldError({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      font: 'var(--scp-form-field-font)',
      color: 'var(--scp-form-field-error-color)',
      padding: '4px var(--scp-form-field-hint-padding,12px) 0',
      ...style
    }
  }, children);
}
function FormField({
  children,
  hint,
  error,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: style,
    className: className
  }, children, error ? /*#__PURE__*/React.createElement(FieldError, null, error) : hint ? /*#__PURE__*/React.createElement(FieldHint, null, hint) : null);
}
Object.assign(__ds_scope, { FieldHint, FieldError, FormField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FormField.jsx", error: String((e && e.message) || e) }); }

// components/forms/FieldError.jsx
try { (() => {

Object.assign(__ds_scope, { FieldError: __ds_scope.FieldError });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FieldError.jsx", error: String((e && e.message) || e) }); }

// components/forms/FieldHint.jsx
try { (() => {

Object.assign(__ds_scope, { FieldHint: __ds_scope.FieldHint });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/FieldHint.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CSS = `
.scp-field{position:relative;display:flex;align-items:center;border:1px solid var(--scp-border-neutral-default);border-radius:5px;background:#fff;font-size:14px;font-family:'Open Sans',sans-serif;color:var(--scp-content-primary);transition:border-color .15s}
.scp-field:hover:not(.scp-field--disabled):not(.scp-field--focused){border-color:var(--scp-border-neutral-hover)}
.scp-field--focused{border-color:var(--scp-primary-color);box-shadow:inset 0 0 0 1px var(--scp-primary-color)}
.scp-field--invalid{border-color:var(--scp-form-field-error-color);box-shadow:none}
.scp-field--invalid.scp-field--focused{box-shadow:inset 0 0 0 1px var(--scp-form-field-error-color)}
.scp-field--disabled{background:var(--scp-input-disabled-bgcolor);color:var(--scp-input-disabled-color)}
.scp-field--lg{height:44px}.scp-field--md{height:40px}.scp-field--sm{height:32px}
.scp-field__label{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--scp-text-neutral-secondary);pointer-events:none;transition:top .15s,font-size .15s;font-size:14px;line-height:1;white-space:nowrap}
.scp-field--float .scp-field__label{top:0;font-size:11px;background:#fff;padding:0 4px;left:12px;border-radius:2px}
.scp-field--focused .scp-field__label{color:var(--scp-primary-color)}
.scp-field--invalid .scp-field__label{color:var(--scp-form-field-error-color)}
.scp-field__control{flex:1;border:none;outline:none;background:transparent;font:inherit;color:inherit;padding:0 16px;height:100%;min-width:0;width:100%}
.scp-field--area{height:auto}
.scp-field--area .scp-field__control{padding:10px 16px;resize:vertical;min-height:60px;line-height:20px}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-field-css')) {
  const s = document.createElement('style');
  s.id = 'scp-field-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function FieldShell({
  label,
  focused,
  filled,
  disabled,
  invalid,
  size = 'md',
  area,
  children,
  style,
  className,
  onClick
}) {
  const cls = ['scp-field', `scp-field--${size}`, area && 'scp-field--area', focused && 'scp-field--focused', disabled && 'scp-field--disabled', invalid && 'scp-field--invalid', (focused || filled) && label && 'scp-field--float', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: cls,
    style: style,
    onClick: onClick
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "scp-field__label"
  }, label), children);
}
function Input({
  label,
  value,
  defaultValue,
  onChange,
  placeholder,
  disabled,
  invalid,
  size = 'md',
  type = 'text',
  style,
  className,
  inputProps
}) {
  const [focused, setFocused] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue || '');
  const val = value !== undefined ? value : inner;
  return /*#__PURE__*/React.createElement(FieldShell, {
    label: label,
    focused: focused,
    filled: !!String(val ?? '').length || !!placeholder,
    disabled: disabled,
    invalid: invalid,
    size: size,
    style: style,
    className: className
  }, /*#__PURE__*/React.createElement("input", _extends({
    className: "scp-field__control",
    type: type,
    value: val,
    placeholder: placeholder,
    disabled: disabled,
    onChange: e => {
      if (value === undefined) setInner(e.target.value);
      onChange && onChange(e.target.value, e);
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false)
  }, inputProps)));
}
Object.assign(__ds_scope, { FieldShell, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/InputSwitcher.jsx
try { (() => {
function InputSwitcher({
  readable,
  writable,
  forcedFocus,
  onFocused,
  onBlurred,
  style,
  className
}) {
  const [focused, setFocused] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!focused || forcedFocus) return;
    const h = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setFocused(false);
        onBlurred && onBlurred();
      }
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [focused, forcedFocus]);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: style,
    className: className,
    onPointerDown: () => {
      if (!focused) {
        setFocused(true);
        onFocused && onFocused();
      }
    }
  }, focused || forcedFocus ? writable : readable);
}
Object.assign(__ds_scope, { InputSwitcher });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/InputSwitcher.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
const CSS = `
.scp-radio{display:inline-flex;align-items:center;cursor:pointer;font-size:14px;font-family:'Open Sans',sans-serif;color:var(--scp-content-primary)}
.scp-radio--disabled{cursor:default}
.scp-radio__circle{position:relative;border-radius:50%;flex-shrink:0}
.scp-radio__outer{position:absolute;inset:0;border:2px solid var(--scp-radio-inactive-border);border-radius:50%;transition:border-color .12s cubic-bezier(0,0,.2,1);box-sizing:border-box}
.scp-radio__inner{position:absolute;inset:0;border-radius:50%;background:var(--scp-primary-color);transform:scale(0);opacity:0;transition:transform .12s ease-in-out;box-sizing:border-box}
.scp-radio--checked .scp-radio__outer{border-color:var(--scp-primary-color)}
.scp-radio--checked .scp-radio__inner{transform:scale(.5);opacity:1}
.scp-radio--disabled .scp-radio__outer{border-color:var(--scp-radio-disabled-border)}
.scp-radio--disabled .scp-radio__inner{background:var(--scp-radio-disabled-color)}
.scp-radio--disabled .scp-radio__label{color:var(--scp-radio-disabled-color)}
.scp-radio__label{padding-left:var(--scp-default-horizontal-gap,8px)}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-radio-css')) {
  const s = document.createElement('style');
  s.id = 'scp-radio-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Radio({
  checked,
  onChange,
  label,
  size = 16,
  disabled,
  name,
  value,
  style,
  className
}) {
  const cls = ['scp-radio', checked && 'scp-radio--checked', disabled && 'scp-radio--disabled', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", {
    className: cls,
    style: style,
    onClick: () => {
      if (!disabled && onChange) onChange(value);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "scp-radio__circle",
    style: {
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "scp-radio__outer"
  }), /*#__PURE__*/React.createElement("span", {
    className: "scp-radio__inner"
  }), /*#__PURE__*/React.createElement("input", {
    type: "radio",
    name: name,
    checked: !!checked,
    readOnly: true,
    disabled: disabled,
    style: {
      position: 'absolute',
      opacity: 0,
      margin: 0,
      width: '100%',
      height: '100%',
      cursor: 'inherit'
    }
  })), label != null && /*#__PURE__*/React.createElement("span", {
    className: "scp-radio__label"
  }, label));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
const CSS = `
.scp-select__value{flex:1;padding:0 16px;display:flex;align-items:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:pointer;height:100%}
.scp-select__arrow{width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid var(--scp-graphic-neutral-secondary);margin-right:14px;flex-shrink:0;transition:transform .15s}
.scp-select--open .scp-select__arrow{transform:rotate(180deg);border-top-color:var(--scp-primary-color)}
.scp-select__panel{position:absolute;top:calc(100% + 4px);left:0;min-width:100%;background:#fff;border-radius:4px;box-shadow:var(--scp-shadow-menu);z-index:1000;max-height:280px;overflow:auto;padding:4px 0}
.scp-select__option{padding:8px 12px;font-size:14px;line-height:20px;cursor:pointer;display:flex;align-items:center;gap:8px;color:var(--scp-content-primary)}
.scp-select__option:hover{background:#eee7f3}
.scp-select__option--selected{color:var(--scp-primary-color);font-weight:600}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-select-css')) {
  const s = document.createElement('style');
  s.id = 'scp-select-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Select({
  label,
  value,
  options = [],
  onChange,
  disabled,
  invalid,
  size = 'md',
  placeholder,
  style,
  className
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const h = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open]);
  const opts = options.map(o => typeof o === 'object' ? o : {
    value: o,
    label: String(o)
  });
  const sel = opts.find(o => o.value === value);
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    style: {
      position: 'relative',
      ...style
    },
    className: className
  }, /*#__PURE__*/React.createElement(__ds_scope.FieldShell, {
    label: label,
    focused: open,
    filled: sel != null || !!placeholder,
    disabled: disabled,
    invalid: invalid,
    size: size,
    className: `scp-select ${open ? 'scp-select--open' : ''}`,
    onClick: () => !disabled && setOpen(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    className: "scp-select__value"
  }, sel ? sel.label : /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--scp-text-neutral-secondary)'
    }
  }, placeholder || '')), /*#__PURE__*/React.createElement("span", {
    className: "scp-select__arrow"
  })), open && /*#__PURE__*/React.createElement("div", {
    className: "scp-select__panel"
  }, opts.map(o => /*#__PURE__*/React.createElement("div", {
    key: String(o.value),
    className: `scp-select__option ${o.value === value ? 'scp-select__option--selected' : ''}`,
    onClick: () => {
      setOpen(false);
      onChange && onChange(o.value);
    }
  }, o.label))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/SlideToggle.jsx
try { (() => {
const SIZES = {
  16: {
    track: 16,
    handle: 12,
    width: 26
  },
  20: {
    track: 20,
    handle: 16,
    width: 36
  },
  28: {
    track: 28,
    handle: 24,
    width: 50
  }
};
const CSS = `
.scp-toggle{display:inline-flex;align-items:center;cursor:pointer;font-size:14px;font-family:'Open Sans',sans-serif;color:var(--scp-content-primary)}
.scp-toggle--disabled{cursor:default;opacity:.5}
.scp-toggle__track{position:relative;border-radius:15px;background:var(--scp-color-neutral-200);transition:background .15s;flex-shrink:0}
.scp-toggle--checked .scp-toggle__track{background:var(--scp-primary-color)}
.scp-toggle__handle{position:absolute;top:50%;transform:translateY(-50%);border-radius:15px;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.3);transition:left .15s}
.scp-toggle__label{padding-left:8px}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-toggle-css')) {
  const s = document.createElement('style');
  s.id = 'scp-toggle-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function SlideToggle({
  checked,
  defaultChecked,
  onChange,
  label,
  size = 20,
  disabled,
  style,
  className
}) {
  const [inner, setInner] = React.useState(!!defaultChecked);
  const val = checked !== undefined ? checked : inner;
  const d = SIZES[size] || SIZES[20];
  const pad = (d.track - d.handle) / 2;
  const cls = ['scp-toggle', val && 'scp-toggle--checked', disabled && 'scp-toggle--disabled', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", {
    className: cls,
    style: style,
    onClick: () => {
      if (disabled) return;
      const n = !val;
      if (checked === undefined) setInner(n);
      onChange && onChange(n);
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "scp-toggle__track",
    style: {
      width: d.width,
      height: d.track
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "scp-toggle__handle",
    style: {
      width: d.handle,
      height: d.handle,
      left: val ? d.width - d.handle - pad : pad
    }
  })), label != null && /*#__PURE__*/React.createElement("span", {
    className: "scp-toggle__label"
  }, label));
}
Object.assign(__ds_scope, { SlideToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SlideToggle.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function Textarea({
  label,
  value,
  defaultValue,
  onChange,
  placeholder,
  rows = 3,
  disabled,
  invalid,
  style,
  className
}) {
  const [focused, setFocused] = React.useState(false);
  const [inner, setInner] = React.useState(defaultValue || '');
  const val = value !== undefined ? value : inner;
  return /*#__PURE__*/React.createElement(__ds_scope.FieldShell, {
    label: label,
    focused: focused,
    filled: !!String(val ?? '').length || !!placeholder,
    disabled: disabled,
    invalid: invalid,
    area: true,
    style: style,
    className: className
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "scp-field__control",
    rows: rows,
    value: val,
    placeholder: placeholder,
    disabled: disabled,
    onChange: e => {
      if (value === undefined) setInner(e.target.value);
      onChange && onChange(e.target.value, e);
    },
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false)
  }));
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/icon/Icon.jsx
try { (() => {
const cache = {};
function assetsRoot() {
  if (typeof window !== 'undefined' && window.SCP_ASSETS_BASE != null) return window.SCP_ASSETS_BASE;
  const l = document.querySelector('link[rel="stylesheet"][href*="styles.css"]');
  return l ? l.getAttribute('href').replace(/styles\.css.*$/, '') : '';
}
function Icon({
  name,
  size = 24,
  width,
  height,
  stroke,
  fill,
  style,
  className
}) {
  const [svg, setSvg] = React.useState(cache[name] || null);
  const ref = React.useRef(null);
  React.useEffect(() => {
    let on = true;
    if (cache[name]) {
      setSvg(cache[name]);
      return;
    }
    fetch(assetsRoot() + 'assets/icons/svg/' + name + '.svg').then(r => r.ok ? r.text() : '').then(t => {
      cache[name] = t;
      if (on) setSvg(t);
    }).catch(() => {});
    return () => {
      on = false;
    };
  }, [name]);
  React.useLayoutEffect(() => {
    const el = ref.current && ref.current.querySelector('svg');
    if (!el) return;
    el.setAttribute('width', width || size);
    el.setAttribute('height', height || size);
    el.style.display = 'block';
    if (stroke) el.querySelectorAll('[stroke]').forEach(p => {
      if (p.getAttribute('stroke') !== 'none') p.setAttribute('stroke', stroke);
    });
    if (fill) el.querySelectorAll('[fill]').forEach(p => {
      if (p.getAttribute('fill') !== 'none') p.setAttribute('fill', fill);
    });
  }, [svg, size, width, height, stroke, fill]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    className: className,
    style: {
      display: 'inline-flex',
      lineHeight: 0,
      flexShrink: 0,
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: svg || ''
    }
  });
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/icon/Icon.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Note.jsx
try { (() => {
const ICONS = {
  info: 'info-filled',
  success: 'notification-success',
  warning: 'notification-warning',
  error: 'notification-error'
};
function Note({
  type = 'info',
  children,
  small,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: className,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: small ? 'var(--scp-note-container-sm-padding,12px)' : 'var(--scp-note-container-padding,16px)',
      borderRadius: 'var(--scp-note-border-radius,4px)',
      background: `var(--scp-note-bg-${type})`,
      color: 'var(--scp-note-font-color,#545d70)',
      fontSize: 'var(--scp-note-font-size,12px)',
      lineHeight: 'normal',
      fontFamily: "'Open Sans',sans-serif",
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: ICONS[type] || ICONS.info,
    size: 20,
    style: {
      color: `var(--scp-note-icon-color-${type})`
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, children));
}
Object.assign(__ds_scope, { Note });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Note.jsx", error: String((e && e.message) || e) }); }

// components/navigation/PageTabs.jsx
try { (() => {
const CSS = `
.scp-page-tabs{display:flex;align-items:flex-end;overflow-x:auto;font-family:'Open Sans',sans-serif}
.scp-page-tabs__tab{display:inline-flex;align-items:center;gap:5px;height:38px;padding:0 7px 0 14px;font-size:14px;line-height:19px;font-weight:400;color:#000;cursor:pointer;white-space:nowrap;border-bottom:4px solid transparent;box-sizing:border-box;user-select:none}
.scp-page-tabs__tab:hover{background:rgba(0,0,0,.03)}
.scp-page-tabs__tab--active{font-weight:700;border-bottom-color:var(--scp-primary-color)}
.scp-page-tabs__icon-btn{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:4px;background:none;border:none;cursor:pointer;color:#77787a;padding:0}
.scp-page-tabs__icon-btn:hover{background:var(--scp-background-action-brand-tertiary-hover)}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-page-tabs-css')) {
  const s = document.createElement('style');
  s.id = 'scp-page-tabs-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function PageTabs({
  tabs = [],
  activeId,
  onSelect,
  onClose,
  onPin,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: `scp-page-tabs ${className || ''}`,
    style: style
  }, tabs.map(t => /*#__PURE__*/React.createElement("a", {
    key: t.id,
    className: `scp-page-tabs__tab ${t.id === activeId ? 'scp-page-tabs__tab--active' : ''}`,
    onClick: () => onSelect && onSelect(t.id)
  }, t.icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 15
  }), t.title, onPin && /*#__PURE__*/React.createElement("button", {
    className: "scp-page-tabs__icon-btn",
    onClick: e => {
      e.stopPropagation();
      onPin(t.id);
    },
    title: t.isPinned ? 'Открепить' : 'Закрепить'
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.isPinned ? 'pin-tab-active' : 'pin-tab',
    width: 10,
    height: 13
  })), onClose && /*#__PURE__*/React.createElement("button", {
    className: "scp-page-tabs__icon-btn",
    onClick: e => {
      e.stopPropagation();
      onClose(t.id);
    },
    title: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "close-tab",
    width: 8,
    height: 7
  })))));
}
Object.assign(__ds_scope, { PageTabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/PageTabs.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Dialog.jsx
try { (() => {
const CSS = `
.scp-dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,.32);display:flex;align-items:center;justify-content:center;z-index:2000}
.scp-dialog{background:var(--scp-background-modal,#fff);border-radius:var(--scp-radius-modal,8px);box-shadow:var(--scp-shadow-level3);display:flex;flex-direction:column;max-height:var(--scp-dialog-max-height-pane,70vh);max-width:var(--scp-dialog-max-width-pane,70vw);min-width:320px;font-family:'Open Sans',sans-serif}
.scp-dialog__header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:var(--scp-dialog-padding-vertical,16px) var(--scp-dialog-padding-horizontal,24px) 0}
.scp-dialog__title{font-size:18px;line-height:24px;font-weight:600;color:var(--scp-content-primary)}
.scp-dialog__subtitle{font-size:14px;line-height:20px;font-weight:400;color:var(--scp-text-neutral-secondary);margin-top:2px}
.scp-dialog__close{background:none;border:none;cursor:pointer;color:var(--scp-dialog-close-btn-color,#a6a6a6);font-size:20px;line-height:1;padding:2px;flex-shrink:0}
.scp-dialog__close:hover{color:var(--scp-content-primary)}
.scp-dialog__content{padding:var(--scp-dialog-padding-body-vertical,8px) var(--scp-dialog-padding-horizontal,24px);overflow:auto;font-size:14px;line-height:20px;color:var(--scp-content-primary);flex:1;margin-top:8px}
.scp-dialog__footer{display:flex;justify-content:flex-end;gap:8px;padding:var(--scp-dialog-padding-vertical,16px) var(--scp-dialog-padding-horizontal,24px)}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-dialog-css')) {
  const s = document.createElement('style');
  s.id = 'scp-dialog-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Dialog({
  open = true,
  title,
  subtitle,
  children,
  footer,
  okText = 'Применить',
  cancelText = 'Отменить',
  onOk,
  onCancel,
  onClose,
  showClose = true,
  width,
  inline,
  style
}) {
  if (!open) return null;
  const card = /*#__PURE__*/React.createElement("div", {
    className: "scp-dialog",
    style: {
      width,
      ...style
    },
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "scp-dialog__header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "scp-dialog__title"
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    className: "scp-dialog__subtitle"
  }, subtitle)), showClose && /*#__PURE__*/React.createElement("button", {
    className: "scp-dialog__close",
    onClick: onClose || onCancel,
    "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "scp-dialog__content"
  }, children), /*#__PURE__*/React.createElement("div", {
    className: "scp-dialog__footer"
  }, footer !== undefined ? footer : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    modifier: "stroked",
    color: "sub-primary",
    onClick: onCancel
  }, cancelText), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    onClick: onOk
  }, okText))));
  return inline ? card : /*#__PURE__*/React.createElement("div", {
    className: "scp-dialog-overlay",
    onClick: onClose || onCancel
  }, card);
}
Object.assign(__ds_scope, { Dialog });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Dialog.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Drawer.jsx
try { (() => {
const CSS = `
.scp-drawer{position:relative;display:flex;flex-direction:column;height:100%;min-width:200px;background:#fff;box-shadow:-2px 0 8px rgba(0,0,0,.15);font-family:'Open Sans',sans-serif;overflow:hidden}
.scp-drawer__handle{position:absolute;left:0;top:0;bottom:0;width:9px;cursor:ew-resize;display:flex;align-items:center;justify-content:center;z-index:10}
.scp-drawer__handle::after{content:'';display:block;height:28px;width:2px;background:var(--scp-drawer-resize-handle-bg,#00000026)}
.scp-drawer__header{display:flex;align-items:center;justify-content:space-between;padding:var(--scp-drawer-container-vertical-padding,16px) var(--scp-drawer-container-horisontal-padding,24px)}
.scp-drawer__title{font-size:18px;font-weight:500;color:var(--scp-content-primary)}
.scp-drawer__close{background:none;border:none;cursor:pointer;color:var(--scp-dialog-close-btn-color,#a6a6a6);font-size:18px;line-height:1;padding:2px;margin-left:8px}
.scp-drawer__close:hover{color:var(--scp-content-primary)}
.scp-drawer__content{flex:1;overflow:auto;padding:var(--scp-drawer-container-vertical-padding,16px) var(--scp-drawer-container-horisontal-padding,24px);font-size:14px;line-height:20px}
.scp-drawer__footer{display:flex;justify-content:flex-end;gap:8px;padding:var(--scp-drawer-container-vertical-padding,16px) var(--scp-drawer-container-horisontal-padding,24px)}
.scp-drawer__footer .scp-btn{min-width:100px}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-drawer-css')) {
  const s = document.createElement('style');
  s.id = 'scp-drawer-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Drawer({
  open = true,
  title,
  children,
  footer,
  okText = 'Применить',
  cancelText = 'Отменить',
  onOk,
  onCancel,
  onClose,
  width = 360,
  resizable = true,
  style
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    className: "scp-drawer",
    style: {
      width,
      ...style
    }
  }, resizable && /*#__PURE__*/React.createElement("div", {
    className: "scp-drawer__handle"
  }), /*#__PURE__*/React.createElement("div", {
    className: "scp-drawer__header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "scp-drawer__title"
  }, title), onClose && /*#__PURE__*/React.createElement("button", {
    className: "scp-drawer__close",
    onClick: onClose,
    "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C"
  }, "\u2715")), /*#__PURE__*/React.createElement("div", {
    className: "scp-drawer__content"
  }, children), footer !== null && /*#__PURE__*/React.createElement("div", {
    className: "scp-drawer__footer"
  }, footer !== undefined ? footer : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    modifier: "stroked",
    color: "sub-primary",
    onClick: onCancel
  }, cancelText), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    onClick: onOk
  }, okText))));
}
Object.assign(__ds_scope, { Drawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Drawer.jsx", error: String((e && e.message) || e) }); }

// components/overlay/Tooltip.jsx
try { (() => {
const CSS = `
.scp-tooltip{position:relative;display:inline-flex}
.scp-tooltip__bubble{position:absolute;left:50%;transform:translateX(-50%);background:var(--scp-tooltip-bgcolor,#1f1f20);color:#fff;font-size:var(--scp-tooltip-font-size,12px);line-height:16px;border-radius:4px;padding:4px 8px;max-width:300px;width:max-content;white-space:pre-line;z-index:3000;pointer-events:none;opacity:0;transition:opacity .12s;font-family:'Open Sans',sans-serif}
.scp-tooltip__bubble--top{bottom:calc(100% + 6px)}
.scp-tooltip__bubble--bottom{top:calc(100% + 6px)}
.scp-tooltip:hover .scp-tooltip__bubble{opacity:1}
`;
if (typeof document !== 'undefined' && !document.getElementById('scp-tooltip-css')) {
  const s = document.createElement('style');
  s.id = 'scp-tooltip-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
function Tooltip({
  text,
  position = 'top',
  children,
  style,
  className
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: `scp-tooltip ${className || ''}`,
    style: style
  }, children, /*#__PURE__*/React.createElement("span", {
    className: `scp-tooltip__bubble scp-tooltip__bubble--${position}`
  }, text));
}
Object.assign(__ds_scope, { Tooltip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/overlay/Tooltip.jsx", error: String((e && e.message) || e) }); }

// ui_kits/scp-shell/GridScreen.jsx
try { (() => {
const {
  Icon,
  Button,
  Checkbox,
  Select
} = window.InPlanDesignSystem_0a4cef;
const gridCss = `
.shell-grid-page{display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--scp-background-secondary)}
.shell-grid-header{display:flex;justify-content:space-between;align-items:center;padding:16px 32px;background:#fff}
.shell-grid-header__title{font:600 18px/24px 'Open Sans';color:#212529}
.shell-grid-wrap{flex:1;overflow:auto;margin:0 15px 15px;background:#fff;border-radius:4px}
.shell-tbl{border-collapse:collapse;width:100%;font:14px/16px 'Open Sans',sans-serif;color:#212529}
.shell-tbl th{font-weight:600;height:36px;background:#f8f8f8;position:sticky;top:0;z-index:2;text-align:left;padding:0 8px;border-right:1px solid #eff1f5;border-bottom:2px solid #eff1f5;white-space:nowrap}
.shell-tbl td{height:32px;padding:0 8px;border-right:1px solid #eff1f5;border-bottom:1px solid #eff1f5;cursor:cell;white-space:nowrap}
.shell-tbl td.num{text-align:right;font-variant-numeric:tabular-nums}
.shell-tbl tr.hl td{background:#eee7f3}
.shell-tbl td.sel{outline:2px solid var(--scp-grid-selected-cell-border-color);outline-offset:-2px;background:#faf3ff}
.shell-tbl td.dis{background:var(--scp-background-disabled);color:#adb0b4;cursor:default}
.shell-tbl .chk{width:38px;text-align:center;padding:0;cursor:default}
`;
if (!document.getElementById('shell-grid-css')) {
  const s = document.createElement('style');
  s.id = 'shell-grid-css';
  s.textContent = gridCss;
  document.head.appendChild(s);
}
const GRID_ROWS = [['SKU-10412', 'Молоко 3,2% 1л', 'РЦ Москва', 1240, 1180, 1310, 1275, 1420], ['SKU-10413', 'Молоко 2,5% 1л', 'РЦ Москва', 980, 1020, 940, 1015, 1100], ['SKU-10921', 'Кефир 1% 0,5л', 'РЦ Казань', 465, 470, 512, 498, 530], ['SKU-11002', 'Сметана 20% 0,3л', 'РЦ Казань', 310, 295, 330, 342, 361], ['SKU-11340', 'Творог 5% 0,2кг', 'РЦ Новосибирск', 220, 214, 236, 228, 251], ['SKU-11341', 'Творог 9% 0,2кг', 'РЦ Новосибирск', 187, 190, 178, 196, 204], ['SKU-12055', 'Йогурт клубника 0,29л', 'РЦ Екатеринбург', 542, 561, 570, 588, 605], ['SKU-12056', 'Йогурт злаки 0,29л', 'РЦ Екатеринбург', 431, 425, 447, 452, 470], ['SKU-13210', 'Масло сливочное 0,18кг', 'РЦ Ростов', 156, 149, 162, 171, 168], ['SKU-13977', 'Сыр Гауда 0,25кг', 'РЦ Ростов', 98, 102, 95, 108, 114]];
const GRID_PERIODS = ['Нед 29', 'Нед 30', 'Нед 31', 'Нед 32', 'Нед 33'];
function ShellGrid({
  onOpenFilter,
  onDelete
}) {
  const [sel, setSel] = React.useState('3-5');
  const [checked, setChecked] = React.useState({
    1: true
  });
  const [slice, setSlice] = React.useState('SKU × склад × неделя');
  return /*#__PURE__*/React.createElement("div", {
    className: "shell-grid-page"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-grid-header"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "shell-grid-header__title"
  }, "\u041F\u043B\u0430\u043D \u043F\u043E\u0441\u0442\u0430\u0432\u043E\u043A"), /*#__PURE__*/React.createElement(Select, {
    size: "sm",
    value: slice,
    onChange: setSlice,
    options: ['SKU × склад × неделя', 'SKU × склад × месяц', 'Категория × регион'],
    style: {
      width: 240
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    color: "sub-primary",
    modifier: "stroked",
    onClick: onOpenFilter
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "filter",
    size: 14
  }), "\u0424\u0438\u043B\u044C\u0442\u0440"), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    color: "sub-primary",
    modifier: "stroked",
    onClick: onDelete
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 14
  }), "\u0423\u0434\u0430\u043B\u0438\u0442\u044C"), /*#__PURE__*/React.createElement(Button, {
    size: "sm"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "save",
    size: 14,
    stroke: "#fff"
  }), "\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C"))), /*#__PURE__*/React.createElement("div", {
    className: "shell-grid-wrap"
  }, /*#__PURE__*/React.createElement("table", {
    className: "shell-tbl"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "chk"
  }, /*#__PURE__*/React.createElement(Checkbox, {
    size: 16
  })), /*#__PURE__*/React.createElement("th", null, "SKU"), /*#__PURE__*/React.createElement("th", null, "\u041D\u0430\u0438\u043C\u0435\u043D\u043E\u0432\u0430\u043D\u0438\u0435"), /*#__PURE__*/React.createElement("th", null, "\u0421\u043A\u043B\u0430\u0434"), GRID_PERIODS.map(p => /*#__PURE__*/React.createElement("th", {
    key: p,
    style: {
      textAlign: 'right'
    }
  }, p)))), /*#__PURE__*/React.createElement("tbody", null, GRID_ROWS.map((r, i) => /*#__PURE__*/React.createElement("tr", {
    key: r[0],
    className: checked[i] ? 'hl' : ''
  }, /*#__PURE__*/React.createElement("td", {
    className: "chk"
  }, /*#__PURE__*/React.createElement(Checkbox, {
    size: 16,
    checked: !!checked[i],
    onChange: v => setChecked(c => ({
      ...c,
      [i]: v
    }))
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      color: 'var(--scp-text-neutral-secondary)'
    }
  }, r[0]), /*#__PURE__*/React.createElement("td", null, r[1]), /*#__PURE__*/React.createElement("td", null, r[2]), r.slice(3).map((v, j) => {
    const key = `${i}-${j + 3}`;
    const dis = i === 9 && j > 2;
    return /*#__PURE__*/React.createElement("td", {
      key: key,
      className: `num ${sel === key ? 'sel' : ''} ${dis ? 'dis' : ''}`,
      onClick: () => !dis && setSel(key)
    }, v.toLocaleString('ru-RU'));
  })))))));
}
window.ShellGrid = ShellGrid;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/scp-shell/GridScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/scp-shell/Header.jsx
try { (() => {
const {
  Icon,
  Button,
  Tooltip,
  PageTabs
} = window.InPlanDesignSystem_0a4cef;
const headerCss = `
.shell-header{background:#fff;position:relative}
.shell-header__top{display:flex;justify-content:space-between;padding:13px 32px 0 35px}
.shell-header__left{margin-top:10px;margin-bottom:30px}
.shell-header__page-title{font-weight:600;font-size:28px;line-height:29px;color:#000;display:flex;align-items:center;column-gap:10px;font-family:'Open Sans',sans-serif}
.shell-header__master{background:#ffd600;border-radius:6px;padding:5px 8px;display:flex;align-items:center;column-gap:8px;font-size:12px;line-height:12px;font-weight:400}
.shell-header__scenario{font-size:14px;display:flex;align-items:center;margin-top:6px;color:#212529;cursor:pointer;transition:.3s ease-out;font-family:'Open Sans',sans-serif}
.shell-header__scenario:hover{color:#9000ff}
.shell-header__actions{display:flex;align-items:center;gap:4px}
.shell-header__bottom{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #cbcbcb;padding:0 32px 0 35px}
.shell-header__avatar{width:36px;height:36px;border-radius:50%;background:url(../../assets/user-avatar.png) no-repeat 50% 50%/cover;display:inline-block}
`;
if (!document.getElementById('shell-header-css')) {
  const s = document.createElement('style');
  s.id = 'shell-header-css';
  s.textContent = headerCss;
  document.head.appendChild(s);
}
function ShellHeader({
  title,
  tabs,
  activeTab,
  onTab,
  onCloseTab,
  onPinTab,
  showMaster,
  onAction
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "shell-header"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-header__top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-header__left"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-header__page-title"
  }, title, showMaster && /*#__PURE__*/React.createElement("span", {
    className: "shell-header__master"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "warning-triangle",
    height: 12,
    width: 14
  }), "\u0418\u0437 \u043C\u0430\u0441\u0442\u0435\u0440 \u0432\u0435\u0440\u0441\u0438\u0438")), /*#__PURE__*/React.createElement("div", {
    className: "shell-header__scenario"
  }, /*#__PURE__*/React.createElement("span", null, "\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439: \u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D"), /*#__PURE__*/React.createElement(Icon, {
    name: "notification-warning",
    size: 16,
    style: {
      margin: '0 10px'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--scp-text-neutral-secondary)'
    }
  }, "\u0412\u0435\u0440\u0441\u0438\u044F 12 \u043E\u0442 14.07.2026 09:41"))), /*#__PURE__*/React.createElement("div", {
    className: "shell-header__actions"
  }, /*#__PURE__*/React.createElement(Tooltip, {
    text: "\u041D\u0430\u0437\u0430\u0434"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    color: "sub-primary-color",
    modifier: "icon-flat",
    onClick: () => onAction('undo')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "corner-up-left",
    size: 24
  }))), /*#__PURE__*/React.createElement(Tooltip, {
    text: "\u042D\u043A\u0441\u043F\u043E\u0440\u0442 \u0432 Excel"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    color: "sub-primary-color",
    modifier: "icon-flat",
    onClick: () => onAction('excel')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "excel-export",
    size: 24
  }))), /*#__PURE__*/React.createElement(Tooltip, {
    text: "\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440 \u043F\u0440\u043E\u0446\u0435\u0441\u0441\u043E\u0432"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    color: "sub-primary-color",
    modifier: "icon-flat",
    onClick: () => onAction('process')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "player-play",
    size: 24
  }))), /*#__PURE__*/React.createElement(Tooltip, {
    text: "\u041B\u0438\u0447\u043D\u044B\u0439 \u043A\u0430\u0431\u0438\u043D\u0435\u0442"
  }, /*#__PURE__*/React.createElement(Button, {
    size: "lg",
    color: "sub-primary-color",
    modifier: "icon-flat",
    style: {
      width: 'auto',
      height: 'auto',
      padding: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "shell-header__avatar"
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "shell-header__bottom"
  }, /*#__PURE__*/React.createElement(PageTabs, {
    tabs: tabs,
    activeId: activeTab,
    onSelect: onTab,
    onClose: onCloseTab,
    onPin: onPinTab
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flexShrink: 0,
      marginLeft: 30,
      display: 'flex',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    color: "sub-primary-color",
    modifier: "icon-flat",
    title: "\u0424\u0438\u043B\u044C\u0442\u0440",
    onClick: () => onAction('filter')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "filter",
    size: 16
  })), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    color: "sub-primary-color",
    modifier: "icon-flat",
    title: "\u041E\u0431\u043D\u043E\u0432\u0438\u0442\u044C",
    onClick: () => onAction('refresh')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh",
    size: 16
  })), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    color: "sub-primary-color",
    modifier: "icon-flat",
    title: "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438",
    onClick: () => onAction('settings')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    size: 16
  })))));
}
window.ShellHeader = ShellHeader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/scp-shell/Header.jsx", error: String((e && e.message) || e) }); }

// ui_kits/scp-shell/HomeScreen.jsx
try { (() => {
const {
  Widget,
  Note
} = window.InPlanDesignSystem_0a4cef;
const homeCss = `
.shell-home{height:100%;border-radius:4px;position:relative;overflow:hidden;background:url(../../assets/home-bg.jpg) no-repeat center/cover;margin:15px;display:flex;justify-content:flex-end}
.shell-home__panel{width:378px;margin:16px;color:#fff;font-family:'Open Sans',sans-serif;overflow:auto}
.shell-home__panel-title{color:#fff;padding:22px 26px 19px;border-bottom:1px solid #cacaca;font:500 16px/22px 'Open Sans'}
.shell-home__card{padding:18px 17px 14px 12px;background:#404040;box-shadow:0 4px 20px -3px rgba(15,23,42,.15);border-radius:4px;margin:0 0 21px;font-size:14px;line-height:20px}
.shell-home__card-row{display:flex;justify-content:space-between;margin-bottom:5px}
.shell-home__card a{text-decoration:underline;color:#91a9ff;font-weight:400;cursor:pointer}
.shell-home__card a:hover{text-decoration:none}
.shell-kpi{display:flex;gap:12px;position:absolute;left:16px;bottom:16px}
`;
if (!document.getElementById('shell-home-css')) {
  const s = document.createElement('style');
  s.id = 'shell-home-css';
  s.textContent = homeCss;
  document.head.appendChild(s);
}
const HOME_EXCEPTIONS = [['Дефицит мощностей', 14], ['Просроченные заказы', 6], ['Нарушение сроков поставки', 3]];
const KPI_RANGES = [{
  type: 'error',
  from: 0,
  to: 30
}, {
  type: 'warning',
  from: 30,
  to: 70
}, {
  type: 'success',
  from: 70
}];
function ShellHome() {
  return /*#__PURE__*/React.createElement("div", {
    className: "shell-home"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-home__panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-home__panel-title"
  }, "\u041F\u0430\u043D\u0435\u043B\u044C \u043F\u0440\u0435\u0434\u0443\u043F\u0440\u0435\u0436\u0434\u0435\u043D\u0438\u0439"), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 34
    }
  }, HOME_EXCEPTIONS.map(([name, n]) => /*#__PURE__*/React.createElement("div", {
    className: "shell-home__card",
    key: name
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-home__card-row"
  }, /*#__PURE__*/React.createElement("span", null, name), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 700
    }
  }, n)), /*#__PURE__*/React.createElement("a", null, "\u041F\u043E\u0441\u043C\u043E\u0442\u0440\u0435\u0442\u044C"))))), /*#__PURE__*/React.createElement("div", {
    className: "shell-kpi"
  }, /*#__PURE__*/React.createElement(Widget, {
    mode: "indicative",
    title: "\u0422\u043E\u0447\u043D\u043E\u0441\u0442\u044C \u043F\u0440\u043E\u0433\u043D\u043E\u0437\u0430",
    value: 82,
    colorRanges: KPI_RANGES,
    width: 220
  }), /*#__PURE__*/React.createElement(Widget, {
    mode: "comparative",
    size: "compact",
    title: "\u041E\u0431\u043E\u0440\u0430\u0447\u0438\u0432\u0430\u0435\u043C\u043E\u0441\u0442\u044C",
    value: 64,
    colorRanges: KPI_RANGES
  }), /*#__PURE__*/React.createElement(Widget, {
    mode: "standard",
    size: "compact",
    title: "\u0414\u043E\u0441\u0442\u0443\u043F\u043D\u043E\u0441\u0442\u044C",
    value: "96,4%"
  })));
}
window.ShellHome = ShellHome;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/scp-shell/HomeScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/scp-shell/Sidebar.jsx
try { (() => {
const {
  Icon
} = window.InPlanDesignSystem_0a4cef;
const sidebarCss = `
.shell-sidebar{width:260px;background:#1b1b1b;color:#fff;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;flex-shrink:0;transition:width .2s ease-in-out;font-family:'Open Sans',sans-serif}
.shell-sidebar--closed{width:69px}
.shell-sidebar__title{padding:27px 19px 32px 24px;display:flex;align-items:flex-end;gap:3px}
.shell-sidebar--closed .shell-sidebar__title{padding:15px 16px}
.shell-sidebar__env{background:#ff9a3b;font-weight:600;font-size:10px;line-height:11px;color:#fff;border-radius:19px;padding:0 12px;margin-left:8px;margin-bottom:4px}
.shell-module{background:#9000ff;color:#fff;font-weight:700;font-size:14px;padding:0 14px 0 16px;min-height:39px;display:flex;align-items:center;gap:17px;cursor:pointer}
.shell-module .mod-icon{width:18px;height:18px}
.shell-modules{background:#9000ff;padding:25px;display:flex;flex-wrap:wrap;justify-content:space-between}
.shell-modules li{list-style:none;display:flex;flex-direction:column;align-items:center;width:40%;margin-bottom:35px;font-size:14px;color:#fff;cursor:pointer;text-align:center;gap:10px}
.shell-section{font-size:14px;line-height:19px;min-height:39px;display:flex;align-items:center;justify-content:space-between;padding:0 14px 0 16px;cursor:pointer;gap:5px}
.shell-section:hover,.shell-section--open{background:#ff9a3b}
.shell-section__t{display:flex;align-items:center;gap:13px;min-width:0}
.shell-section__t span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.shell-section__chev{transition:transform .2s;flex-shrink:0}
.shell-section--open .shell-section__chev{transform:rotate(180deg)}
.shell-submenu{background:#404040;margin:0;padding:0}
.shell-submenu li{list-style:none}
.shell-submenu a{font-size:14px;line-height:14px;color:#fff;text-decoration:none;height:39px;display:flex;align-items:center;padding-left:26px;padding-right:11px;position:relative;cursor:pointer}
.shell-submenu a::before{content:'';width:6px;height:6px;border-radius:6px;background:#ff9a3b;position:absolute;left:16px}
.shell-submenu li.active{background-color:#9c9c9c;position:relative}
.shell-submenu li.active::before{content:'';display:block;width:4px;height:39px;background:#9000ff;position:absolute;left:0}
.shell-submenu li.active a::before{background:#9000ff}
.shell-submenu li:not(.active) a:hover{background:#9c9c9c}
.shell-sidebar .sicon svg path{stroke:#fff}
`;
if (!document.getElementById('shell-sidebar-css')) {
  const s = document.createElement('style');
  s.id = 'shell-sidebar-css';
  s.textContent = sidebarCss;
  document.head.appendChild(s);
}
const SHELL_MODULES = [{
  id: 'sp',
  name: 'Планирование поставок',
  icon: 'mod-supply-planning'
}, {
  id: 'dp',
  name: 'Прогнозирование спроса',
  icon: 'mod-demand-planning'
}, {
  id: 'ps',
  name: 'Производственное расписание',
  icon: 'mod-production-scheduling'
}, {
  id: 'io',
  name: 'Оптимизация запасов',
  icon: 'mod-inventory-optimization'
}, {
  id: 'pl',
  name: 'Платформа',
  icon: 'mod-platform'
}];
const SHELL_MENU = [{
  id: 'plan',
  name: 'Планирование',
  icon: 'chart-line',
  children: ['План продаж', 'План поставок', 'Загрузка мощностей']
}, {
  id: 'data',
  name: 'Данные',
  icon: 'data-base',
  children: ['Параметры расчёта', 'Справочники']
}, {
  id: 'analysis',
  name: 'Аналитика',
  icon: 'chart-bar',
  children: ['Анализ результата', 'КПЭ']
}, {
  id: 'proc',
  name: 'Процессы',
  icon: 'player-play',
  children: ['Менеджер процессов', 'История запусков']
}];
function ShellSidebar({
  open,
  activeScreen,
  onNavigate
}) {
  const [moduleOpen, setModuleOpen] = React.useState(false);
  const [module, setModule] = React.useState(SHELL_MODULES[0]);
  const [section, setSection] = React.useState('plan');
  return /*#__PURE__*/React.createElement("div", {
    className: `shell-sidebar ${open ? '' : 'shell-sidebar--closed'}`
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      overflow: 'hidden',
      flex: 1,
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-sidebar__title"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/header-logo-in.png",
    alt: "in."
  }), open && /*#__PURE__*/React.createElement("img", {
    src: "../../assets/header-logo-plan.png",
    alt: "plan"
  }), open && /*#__PURE__*/React.createElement("span", {
    className: "shell-sidebar__env"
  }, "Prod")), /*#__PURE__*/React.createElement("div", {
    className: "shell-module",
    onClick: () => setModuleOpen(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    className: "sicon",
    name: moduleOpen ? 'close-white' : 'burger',
    size: 18,
    stroke: "#fff"
  }), open && /*#__PURE__*/React.createElement("span", {
    style: {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, module.name)), moduleOpen && open ? /*#__PURE__*/React.createElement("ul", {
    className: "shell-modules"
  }, SHELL_MODULES.map(m => /*#__PURE__*/React.createElement("li", {
    key: m.id,
    onClick: () => {
      setModule(m);
      setModuleOpen(false);
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    className: "sicon",
    name: m.icon,
    size: 27,
    stroke: "#fff"
  }), m.name))) : /*#__PURE__*/React.createElement("div", {
    style: {
      overflowY: 'auto',
      flex: 1
    }
  }, SHELL_MENU.map(item => /*#__PURE__*/React.createElement("div", {
    key: item.id
  }, /*#__PURE__*/React.createElement("div", {
    className: `shell-section ${section === item.id ? 'shell-section--open' : ''}`,
    onClick: () => setSection(section === item.id ? null : item.id)
  }, /*#__PURE__*/React.createElement("div", {
    className: "shell-section__t"
  }, /*#__PURE__*/React.createElement(Icon, {
    className: "sicon",
    name: item.icon,
    size: 22,
    stroke: "#fff"
  }), open && /*#__PURE__*/React.createElement("span", null, item.name)), open && /*#__PURE__*/React.createElement(Icon, {
    className: "sicon shell-section__chev",
    name: "accordion-icon",
    width: 11,
    height: 7,
    stroke: "#fff"
  })), section === item.id && open && /*#__PURE__*/React.createElement("ul", {
    className: "shell-submenu"
  }, item.children.map(c => /*#__PURE__*/React.createElement("li", {
    key: c,
    className: activeScreen === c ? 'active' : ''
  }, /*#__PURE__*/React.createElement("a", {
    onClick: () => onNavigate(c)
  }, c)))))))));
}
window.ShellSidebar = ShellSidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/scp-shell/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/scp-shell/app.jsx
try { (() => {
const {
  Dialog,
  Drawer,
  Input,
  FormField,
  Button,
  Icon
} = window.InPlanDesignSystem_0a4cef;
function ShellApp() {
  const [menuOpen, setMenuOpen] = React.useState(true);
  const [screen, setScreen] = React.useState('План поставок');
  const [tabs, setTabs] = React.useState([{
    id: 'Главная',
    title: 'Главная',
    isPinned: true
  }, {
    id: 'План поставок',
    title: 'План поставок'
  }, {
    id: 'Загрузка мощностей',
    title: 'Загрузка мощностей'
  }]);
  const [drawer, setDrawer] = React.useState(false);
  const [dialog, setDialog] = React.useState(false);
  const navigate = name => {
    setScreen(name);
    setTabs(t => t.some(x => x.id === name) ? t : [...t, {
      id: name,
      title: name
    }]);
  };
  const closeTab = id => {
    setTabs(t => t.filter(x => x.id !== id));
    if (screen === id) setScreen('Главная');
  };
  const isGrid = screen !== 'Главная';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: 'var(--scp-background-secondary)'
    }
  }, /*#__PURE__*/React.createElement(window.ShellSidebar, {
    open: menuOpen,
    activeScreen: screen,
    onNavigate: navigate
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minWidth: 0,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => setMenuOpen(v => !v),
    title: "\u0421\u0432\u0435\u0440\u043D\u0443\u0442\u044C \u043C\u0435\u043D\u044E",
    style: {
      position: 'absolute',
      top: 30,
      left: -10,
      zIndex: 101,
      cursor: 'pointer',
      transition: 'transform .2s ease-in-out',
      transform: menuOpen ? 'none' : 'rotate(180deg)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "toggle-sidebar",
    size: 20
  })), /*#__PURE__*/React.createElement(window.ShellHeader, {
    title: screen,
    tabs: tabs,
    activeTab: screen,
    onTab: navigate,
    onCloseTab: closeTab,
    onPinTab: id => setTabs(t => t.map(x => x.id === id ? {
      ...x,
      isPinned: !x.isPinned
    } : x)),
    showMaster: isGrid,
    onAction: a => {
      if (a === 'filter') setDrawer(true);
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: 'flex',
      flexDirection: 'column'
    }
  }, isGrid ? /*#__PURE__*/React.createElement(window.ShellGrid, {
    onOpenFilter: () => setDrawer(true),
    onDelete: () => setDialog(true)
  }) : /*#__PURE__*/React.createElement(window.ShellHome, null)), drawer && /*#__PURE__*/React.createElement("aside", {
    style: {
      flexShrink: 0,
      height: '100%'
    }
  }, /*#__PURE__*/React.createElement(Drawer, {
    title: "\u0424\u0438\u043B\u044C\u0442\u0440\u044B",
    width: 340,
    onClose: () => setDrawer(false),
    onOk: () => setDrawer(false),
    onCancel: () => setDrawer(false)
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      paddingTop: 4
    }
  }, /*#__PURE__*/React.createElement(FormField, null, /*#__PURE__*/React.createElement(Input, {
    label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0444\u0438\u043B\u044C\u0442\u0440\u0430",
    size: "sm"
  })), /*#__PURE__*/React.createElement(FormField, null, /*#__PURE__*/React.createElement(Input, {
    label: "SKU",
    size: "sm",
    defaultValue: "SKU-10412"
  })), /*#__PURE__*/React.createElement(FormField, {
    hint: "\u0427\u0435\u0440\u0435\u0437 \u0437\u0430\u043F\u044F\u0442\u0443\u044E"
  }, /*#__PURE__*/React.createElement(Input, {
    label: "\u0421\u043A\u043B\u0430\u0434",
    size: "sm",
    defaultValue: "\u0420\u0426 \u041C\u043E\u0441\u043A\u0432\u0430, \u0420\u0426 \u041A\u0430\u0437\u0430\u043D\u044C"
  }))))))), dialog && /*#__PURE__*/React.createElement(Dialog, {
    title: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0441\u0442\u0440\u043E\u043A\u0438?",
    subtitle: "\u0414\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u043B\u044C\u0437\u044F \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C",
    okText: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C",
    onOk: () => setDialog(false),
    onCancel: () => setDialog(false),
    onClose: () => setDialog(false),
    width: 420
  }, "\u0412\u044B\u0431\u0440\u0430\u043D\u043D\u044B\u0435 \u0441\u0442\u0440\u043E\u043A\u0438 \u0431\u0443\u0434\u0443\u0442 \u0443\u0434\u0430\u043B\u0435\u043D\u044B \u0438\u0437 \u0442\u0435\u043A\u0443\u0449\u0435\u0439 \u0432\u0435\u0440\u0441\u0438\u0438 \u0441\u0446\u0435\u043D\u0430\u0440\u0438\u044F \xAB\u0411\u0430\u0437\u043E\u0432\u044B\u0439 \u043F\u043B\u0430\u043D\xBB."));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(ShellApp, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/scp-shell/app.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.ExpandableText = __ds_scope.ExpandableText;

__ds_ns.IndicativeScale = __ds_scope.IndicativeScale;

__ds_ns.ScrollContainer = __ds_scope.ScrollContainer;

__ds_ns.Widget = __ds_scope.Widget;

__ds_ns.FormState = __ds_scope.FormState;

__ds_ns.Loading = __ds_scope.Loading;

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Note = __ds_scope.Note;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.FieldError = __ds_scope.FieldError;

__ds_ns.FieldHint = __ds_scope.FieldHint;

__ds_ns.FormField = __ds_scope.FormField;

__ds_ns.FieldShell = __ds_scope.FieldShell;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.InputSwitcher = __ds_scope.InputSwitcher;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.SlideToggle = __ds_scope.SlideToggle;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.PageTabs = __ds_scope.PageTabs;

__ds_ns.Dialog = __ds_scope.Dialog;

__ds_ns.Drawer = __ds_scope.Drawer;

__ds_ns.Tooltip = __ds_scope.Tooltip;

})();
