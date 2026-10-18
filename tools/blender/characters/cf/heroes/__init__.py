"""Hero registry: id -> spec dict {id, oath, cls, body:{...}, skin, eyes, hair, outfit(F, b, spec), tris, ref}."""
import importlib

HEROES = {}


def hero(id, **spec):
    def deco(fn):
        spec['id'] = id
        spec['outfit'] = fn
        spec.setdefault('oath', id[:7])
        spec.setdefault('cls', id.split('-')[-1])
        HEROES[id] = spec
        return fn
    return deco


for m in ['h01', 'h02', 'h03', 'h04', 'h05', 'h06', 'h07', 'h08', 'h09', 'h10', 'h11', 'h12', 'h13', 'h14', 'h15']:
    try:
        importlib.import_module(f'{__name__}.{m}')
    except ModuleNotFoundError as e:
        if f'{__name__}.{m}' not in str(e):
            raise
