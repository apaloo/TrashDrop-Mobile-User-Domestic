#!/usr/bin/env python3
"""
Local pre-flight for bin-pickup.flow.json.

Meta's Flow Builder is the only complete validator, but it is a round trip. This
catches the mistakes that have actually bitten us: wrong scalar types, dangling
cross-screen references, and unreachable screens.

    python3 validate.py [flow.json]
"""
import json, re, sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'bin-pickup.flow.json'
INPUTS = {'TextInput', 'TextArea', 'DatePicker', 'CalendarPicker', 'Dropdown',
          'RadioButtonsGroup', 'CheckboxGroup', 'OptIn', 'Switch', 'ChipsSelector'}
# Flow JSON scalar types that are easy to get wrong. Meta rejects a string here.
INT_PROPS = {'max-length', 'min-length', 'max-chars', 'max-selected-items', 'min-selected-items'}
BOOL_PROPS = {'required', 'enabled', 'visible', 'terminal', 'success'}

# Documented per-component limits. Flow Builder warns rather than errors on some
# of these, but an over-long label is truncated on smaller handsets.
LABEL_MAX = {
    'Dropdown': 20, 'TextInput': 20, 'TextArea': 20,
    'RadioButtonsGroup': 30, 'CheckboxGroup': 30,
    'DatePicker': 40, 'CalendarPicker': 40,
    'Footer': 35,
}
HELPER_TEXT_MAX = 80
OPTION_TITLE_MAX = 30
OPTION_DESCRIPTION_MAX = 300

flow = json.load(open(PATH))
screens = {s['id']: s for s in flow['screens']}
problems = []


def walk(node, fn, path=''):
    if isinstance(node, dict):
        fn(node, path)
        for k, v in node.items():
            walk(v, fn, f'{path}.{k}')
    elif isinstance(node, list):
        for i, v in enumerate(node):
            walk(v, fn, f'{path}[{i}]')


# scalar types
def check_types(node, path):
    for k, v in node.items():
        if k in INT_PROPS and not isinstance(v, int) and not str(v).startswith('${'):
            problems.append(f'{path}.{k} = {v!r} must be an integer, not {type(v).__name__}')
        if k in BOOL_PROPS and not isinstance(v, bool) and not str(v).startswith('${'):
            problems.append(f'{path}.{k} = {v!r} must be a boolean, not {type(v).__name__}')
walk(flow, check_types)

if not isinstance(flow.get('version'), str):
    problems.append("top-level 'version' must be a string")


# label / helper-text / option lengths
def check_lengths(node, path):
    t = node.get('type')
    label = node.get('label')
    if t in LABEL_MAX and isinstance(label, str) and len(label) > LABEL_MAX[t]:
        problems.append(
            f"{path}: {t} label {label!r} is {len(label)} chars, "
            f"max {LABEL_MAX[t]} (truncates on small screens)")

    helper = node.get('helper-text')
    if isinstance(helper, str) and len(helper) > HELPER_TEXT_MAX:
        problems.append(f'{path}: helper-text is {len(helper)} chars, max {HELPER_TEXT_MAX}')

    ds = node.get('data-source')
    if isinstance(ds, list):
        for i, item in enumerate(ds):
            if not isinstance(item, dict):
                continue
            title = item.get('title', '')
            desc = item.get('description', '')
            if isinstance(title, str) and len(title) > OPTION_TITLE_MAX:
                problems.append(f'{path}.data-source[{i}].title is {len(title)} chars, max {OPTION_TITLE_MAX}')
            if isinstance(desc, str) and len(desc) > OPTION_DESCRIPTION_MAX:
                problems.append(f'{path}.data-source[{i}].description is {len(desc)} chars, max {OPTION_DESCRIPTION_MAX}')
walk(flow, check_lengths)

# input names per screen
fields = {}
for sid, s in screens.items():
    names = set()
    walk(s, lambda n, p, names=names: names.add(n['name']) if n.get('type') in INPUTS else None)
    fields[sid] = names

# navigate targets
walk(flow, lambda n, p: problems.append(f"navigate -> unknown screen {n.get('next', {}).get('name')!r}")
     if n.get('name') == 'navigate' and n.get('next', {}).get('name') not in screens else None)

# cross-screen refs
for sid, fld in re.findall(r'\$\{screen\.([A-Za-z_]+)\.form\.([A-Za-z_]+)\}', json.dumps(flow)):
    if sid not in screens:
        problems.append(f'${{screen.{sid}...}} -> no such screen')
    elif fld not in fields[sid]:
        problems.append(f'${{screen.{sid}.form.{fld}}} -> no such input on {sid}')

# data bindings declared
for sid, s in screens.items():
    declared = set(s.get('data', {}))
    for u in set(re.findall(r'\$\{data\.([A-Za-z_]+)\}', json.dumps(s))) - declared:
        problems.append(f'{sid}: uses ${{data.{u}}} but never declares it')

# terminal / complete pairing, reachability
for sid, s in screens.items():
    acts = []
    walk(s, lambda n, p, acts=acts: acts.append(n['name'])
         if n.get('name') in {'complete', 'navigate', 'data_exchange'} else None)
    if s.get('terminal') and 'complete' not in acts:
        problems.append(f'{sid} is terminal but never completes')
    if not s.get('terminal') and 'complete' in acts:
        problems.append(f'{sid} completes but is not marked terminal')

reachable = {flow['screens'][0]['id']}
walk(flow, lambda n, p: reachable.add(n['next']['name']) if n.get('name') == 'navigate' else None)
for sid in screens:
    if sid not in reachable:
        problems.append(f'{sid} is unreachable')

if problems:
    print(f'{PATH}: {len(problems)} problem(s)')
    for p in problems:
        print('  x', p)
    sys.exit(1)

print(f'{PATH}: OK — {len(screens)} screens, '
      f'{sum(len(v) for v in fields.values())} inputs, types and references consistent')
