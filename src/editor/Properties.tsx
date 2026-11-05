import { cloneElement, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  DirectionSchema,
  EventDefinitionSchema,
  EventKindSchema,
  GatewayKindSchema,
  NodeTypeSchema,
  SystemCodeSchema,
  type Edge,
  type Group,
  type ProcessNode,
} from '../data/schema';
import { ru } from '../i18n/ru';
import { validateUrl } from '../utils/url';
import { useEditor, useEditorForm } from './interaction';
import { defaultEdgeKind } from './geometry';
import { groupBox } from './geometry';
import { editorId } from './operations';
import { snap } from './geometry';
import { splitStageDataNodes } from '../utils/stageNodes';
import styles from './Editor.module.css';

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ 'aria-label'?: string }>;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {cloneElement(children, { 'aria-label': label })}
    </label>
  );
}

function useValues<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const signature = JSON.stringify(initial);
  const baseline = useRef(signature);
  useEffect(() => {
    if (baseline.current === signature) return;
    const before = baseline.current;
    baseline.current = signature;
    setValue((previous) => (JSON.stringify(previous) === before ? initial : previous));
  }, [initial, signature]);
  return { value, setValue, dirty: JSON.stringify(value) !== signature };
}

export function NodeProperties({ node }: { node?: ProcessNode }) {
  const editor = useEditor()!;
  const target = editor.target;
  const creating = node === undefined;
  const initial = useMemo(
    () => ({
      label: node?.label ?? ru.editor.newNode,
      description: node?.description ?? '',
      type: node?.type ?? 'step',
      group: node?.group ?? (target?.kind === 'createNode' ? (target.groupId ?? '') : ''),
      direction:
        node?.direction ??
        (node && splitStageDataNodes(editor.stage).outputs.some((item) => item.id === node.id)
          ? 'out'
          : 'in'),
      system: node?.system ?? '',
      owner: node?.owner ?? '',
      gatewayKind: node?.gatewayKind ?? 'exclusive',
      eventKind: node?.eventKind ?? 'start',
      eventDefinition: node?.eventDefinition ?? 'none',
      parent: node
        ? (editor.stage.edges.find((edge) => edge.target === node.id)?.source ?? '')
        : target?.kind === 'createNode'
          ? (target.parentId ?? '')
          : '',
      screenTitle: '',
      screenUrl: '',
    }),
    [node, target, editor.stage],
  );
  const { value, setValue, dirty } = useValues(initial);
  const [error, setError] = useState('');
  const change = (key: keyof typeof value, text: string) => {
    setValue({ ...value, [key]: text });
    setError('');
  };
  const apply = (): boolean => {
    try {
      if (!value.label.trim()) throw new Error(ru.editor.invalidName);
      if (
        creating &&
        (value.screenTitle || value.screenUrl) &&
        (!value.screenTitle.trim() || validateUrl(value.screenUrl).status === 'invalid')
      )
        throw new Error(ru.editor.linkEmpty);
      const type = NodeTypeSchema.parse(value.type);
      if (type === 'detail' && !value.parent) throw new Error(ru.editor.chooseParent);
      const fields = {
        label: value.label.trim(),
        description: value.description || undefined,
        group: value.group || undefined,
        system: value.system ? SystemCodeSchema.parse(value.system) : undefined,
        owner: value.owner || undefined,
        direction: type === 'data' ? DirectionSchema.parse(value.direction) : undefined,
        gatewayKind: type === 'gateway' ? GatewayKindSchema.parse(value.gatewayKind) : undefined,
        eventKind: type === 'event' ? EventKindSchema.parse(value.eventKind) : undefined,
        eventDefinition:
          type === 'event' ? EventDefinitionSchema.parse(value.eventDefinition) : undefined,
      };
      if (node) {
        const saved = editor.run({
          type: 'updateNode',
          id: node.id,
          patch: fields,
          parentId: type === 'detail' ? value.parent : undefined,
        });
        if (saved) setValue({ ...value, label: fields.label });
        return saved;
      }
      const position = target && 'x' in target ? { x: target.x, y: target.y } : { x: 0, y: 0 };
      const created: ProcessNode = {
        id: editorId('node'),
        type,
        ...fields,
        position,
        ...(value.screenTitle
          ? { screen: { title: value.screenTitle.trim(), url: value.screenUrl.trim() } }
          : {}),
      };
      if (!editor.run({ type: 'addNode', node: created, parentId: value.parent || undefined }))
        return false;
      editor.select({ kind: 'node', id: created.id }, true);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : ru.editor.error);
      return false;
    }
  };
  useEditorForm(dirty, apply);
  const parents = editor.stage.nodes.filter(
    (item) => item.type !== 'data' && item.type !== 'detail',
  );
  return (
    <form
      className={`${styles.form} ${styles.section}`}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      {creating && (
        <Field label={ru.editor.type}>
          <select
            className={styles.input}
            value={value.type}
            onChange={(event) => change('type', event.target.value)}
          >
            {NodeTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {ru.editor.nodeTypes[type]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label={ru.editor.name}>
        <textarea
          className={styles.input}
          value={value.label}
          onChange={(event) => change('label', event.target.value)}
        />
      </Field>
      <Field label={ru.editor.description}>
        <textarea
          className={styles.input}
          value={value.description}
          onChange={(event) => change('description', event.target.value)}
        />
      </Field>
      <Field label={ru.editor.group}>
        <select
          className={styles.input}
          value={value.group}
          onChange={(event) => change('group', event.target.value)}
        >
          <option value="">{ru.editor.noGroup}</option>
          {editor.stage.groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      </Field>
      {value.type === 'detail' && (
        <Field label={ru.editor.parent}>
          <select
            className={styles.input}
            value={value.parent}
            onChange={(event) => change('parent', event.target.value)}
          >
            <option value="">{ru.editor.chooseParent}</option>
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.label}
              </option>
            ))}
          </select>
        </Field>
      )}
      {value.type === 'data' && (
        <Field label={ru.editor.direction}>
          <select
            className={styles.input}
            value={value.direction}
            onChange={(event) => change('direction', event.target.value)}
          >
            <option value="in">{ru.editor.input}</option>
            <option value="out">{ru.editor.output}</option>
          </select>
        </Field>
      )}
      <Field label={ru.editor.system}>
        <select
          className={styles.input}
          value={value.system}
          onChange={(event) => change('system', event.target.value)}
        >
          <option value="">{ru.editor.noSystem}</option>
          {SystemCodeSchema.options.map((system) => (
            <option key={system} value={system}>
              {ru.systems[system]}
            </option>
          ))}
        </select>
      </Field>
      <Field label={ru.editor.owner}>
        <input
          className={styles.input}
          value={value.owner}
          onChange={(event) => change('owner', event.target.value)}
        />
      </Field>
      {value.type === 'gateway' && (
        <Field label={ru.editor.gatewayKind}>
          <select
            className={styles.input}
            value={value.gatewayKind}
            onChange={(event) => change('gatewayKind', event.target.value)}
          >
            {GatewayKindSchema.options.map((kind) => (
              <option key={kind} value={kind}>
                {ru.editor.gatewayKinds[kind]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {value.type === 'event' && (
        <>
          <Field label={ru.editor.eventKind}>
            <select
              className={styles.input}
              value={value.eventKind}
              onChange={(event) => change('eventKind', event.target.value)}
            >
              {EventKindSchema.options.map((kind) => (
                <option key={kind} value={kind}>
                  {ru.editor.eventKinds[kind]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={ru.editor.eventDefinition}>
            <select
              className={styles.input}
              value={value.eventDefinition}
              onChange={(event) => change('eventDefinition', event.target.value)}
            >
              {EventDefinitionSchema.options.map((kind) => (
                <option key={kind} value={kind}>
                  {ru.editor.eventDefinitions[kind]}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}
      {creating && (
        <>
          <Field label={ru.editor.screenTitle}>
            <input
              className={styles.input}
              maxLength={80}
              value={value.screenTitle}
              onChange={(event) => change('screenTitle', event.target.value)}
            />
          </Field>
          <Field label={ru.editor.screenUrl}>
            <input
              className={styles.input}
              value={value.screenUrl}
              onChange={(event) => change('screenUrl', event.target.value)}
            />
          </Field>
        </>
      )}
      {error && (
        <p role="alert" className={styles.message}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button
          className={`${styles.button} ${styles.primary}`}
          type="submit"
          onClick={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          {creating ? ru.editor.create : ru.editor.apply}
        </button>
        <button
          className={styles.button}
          type="button"
          onClick={() => (creating ? editor.select(null, true) : setValue(initial))}
        >
          {ru.editor.cancel}
        </button>
      </div>
    </form>
  );
}

export function GroupProperties({ group }: { group: Group }) {
  const editor = useEditor()!;
  const { value, setValue, dirty } = useValues(group.label);
  const apply = () => {
    const saved = editor.run({ type: 'upsertGroup', group: { ...group, label: value.trim() } });
    if (saved) setValue(value.trim());
    return saved;
  };
  useEditorForm(dirty, apply);
  return (
    <>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        <Field label={ru.editor.name}>
          <input
            className={styles.input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </Field>
        <button
          className={`${styles.button} ${styles.primary}`}
          type="submit"
          onClick={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          {ru.editor.apply}
        </button>
      </form>
      <GroupPosition key={group.id} group={group} />
    </>
  );
}

function GroupPosition({ group }: { group: Group }) {
  const editor = useEditor()!;
  const origin = groupBox(editor.stage, group);
  const { value: position, setValue: setPosition, dirty } = useValues({ x: origin.x, y: origin.y });
  const apply = () => {
    const saved = editor.run({
      type: 'moveGroup',
      id: group.id,
      dx: position.x - origin.x,
      dy: position.y - origin.y,
    });
    if (saved) setPosition({ x: snap(position.x), y: snap(position.y) });
    return saved;
  };
  useEditorForm(dirty, apply);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className={styles.row}>
        {(['x', 'y'] as const).map((axis) => (
          <Field key={axis} label={axis === 'x' ? ru.editor.x : ru.editor.y}>
            <input
              className={styles.input}
              type="number"
              step="16"
              required
              value={position[axis]}
              onChange={(event) => setPosition({ ...position, [axis]: event.target.valueAsNumber })}
            />
          </Field>
        ))}
      </div>
      <button
        className={styles.button}
        type="submit"
        onClick={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        {ru.editor.move}
      </button>
    </form>
  );
}

export function EdgeProperties({ edge }: { edge?: Edge }) {
  const editor = useEditor()!;
  const initial = useMemo(
    () => ({
      source: edge?.source ?? '',
      target: edge?.target ?? '',
      label: edge?.label ?? '',
      kind: edge?.kind ?? 'process',
    }),
    [edge],
  );
  const { value, setValue, dirty } = useValues(initial);
  const apply = () => {
    const id = edge?.id ?? editorId('edge');
    if (
      !editor.run({ type: 'upsertEdge', edge: { ...value, id, label: value.label || undefined } })
    )
      return false;
    if (!edge) editor.select({ kind: 'edge', id }, true);
    return true;
  };
  useEditorForm(dirty, apply);
  const setEndpoint = (side: 'source' | 'target', id: string) => {
    const next = { ...value, [side]: id };
    const source = editor.stage.nodes.find((node) => node.id === next.source);
    const target = editor.stage.nodes.find((node) => node.id === next.target);
    if (source && target) next.kind = defaultEdgeKind(source, target);
    setValue(next);
  };
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      {(['source', 'target'] as const).map((side) => (
        <Field key={side} label={side === 'source' ? ru.editor.source : ru.editor.target}>
          <select
            className={styles.input}
            value={value[side]}
            onChange={(event) => setEndpoint(side, event.target.value)}
          >
            <option value="">—</option>
            {editor.stage.nodes
              .filter((node) => side === 'target' || node.type !== 'detail')
              .map((node) => (
                <option key={node.id} value={node.id}>
                  {node.label}
                </option>
              ))}
          </select>
        </Field>
      ))}
      <Field label={ru.editor.edgeKind}>
        <select
          className={styles.input}
          value={value.kind}
          onChange={(event) => setValue({ ...value, kind: event.target.value as Edge['kind'] })}
        >
          {Object.entries(ru.editor.edgeKinds).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={ru.editor.label}>
        <input
          className={styles.input}
          value={value.label}
          onChange={(event) => setValue({ ...value, label: event.target.value })}
        />
      </Field>
      <button
        className={`${styles.button} ${styles.primary}`}
        type="submit"
        onClick={(event) => {
          event.preventDefault();
          apply();
        }}
      >
        {edge ? ru.editor.apply : ru.editor.create}
      </button>
    </form>
  );
}

export function PositionProperties({ node }: { node: ProcessNode }) {
  const editor = useEditor()!;
  const { value: position, setValue: setPosition, dirty } = useValues(node.position);
  const apply = () => {
    const saved = editor.run({ type: 'moveNode', id: node.id, position });
    if (saved) setPosition({ x: snap(position.x), y: snap(position.y) });
    return saved;
  };
  useEditorForm(dirty, apply);
  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <div className={styles.row}>
        {(['x', 'y'] as const).map((axis) => (
          <Field key={axis} label={axis === 'x' ? ru.editor.x : ru.editor.y}>
            <input
              className={styles.input}
              type="number"
              step="16"
              required
              value={position[axis]}
              onChange={(event) => setPosition({ ...position, [axis]: event.target.valueAsNumber })}
            />
          </Field>
        ))}
      </div>
      <button
        type="submit"
        onClick={(event) => {
          event.preventDefault();
          apply();
        }}
        className={styles.button}
      >
        {ru.editor.move}
      </button>
    </form>
  );
}
