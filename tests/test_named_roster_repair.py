"""Pure-stdlib geometry repair regression tests; no Blender/GPU required."""
import importlib.util
import json
from pathlib import Path
import struct
import unittest

REPAIR = Path(__file__).resolve().parents[1] / "tools/production/repair_named_roster_glb.py"
spec = importlib.util.spec_from_file_location("aetherion_repair", REPAIR)
repair = importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


def sample_glb(all_degenerate=False):
    positions = [
        (0.0, 0.0, 0.0),
        (1.0, 0.0, 0.0),
        (0.0, 1.0, 0.0),
        (0.0, 0.0, 0.0),
    ]
    indexes = [0, 0, 3, 0, 0, 3] if all_degenerate else [0, 1, 2, 0, 0, 3]
    vertices = b"".join(struct.pack("<fff", *p) for p in positions)
    triangles = b"".join(struct.pack("<I", i) for i in indexes)
    body = vertices + triangles
    doc = {
        "asset": {"version": "2.0"},
        "buffers": [{"byteLength": len(body)}],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(vertices)},
            {"buffer": 0, "byteOffset": len(vertices), "byteLength": len(triangles)},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 4, "type": "VEC3"},
            {"bufferView": 1, "componentType": 5125, "count": 6, "type": "SCALAR"},
        ],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "nodes": [{"mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
        "extras": {"art_approval": False},
    }
    text = json.dumps(doc, separators=(",", ":")).encode()
    text += b" " * (-len(text) % 4)
    return (
        b"glTF" + struct.pack("<II", 2, 12 + 8 + len(text) + 8 + len(body))
        + struct.pack("<I4s", len(text), b"JSON") + text
        + struct.pack("<I4s", len(body), b"BIN\x00") + body
    )


class MeshRepairTests(unittest.TestCase):
    def test_removes_degenerate_face_and_corrects_up_axis(self):
        new, faces, changed = repair.fix(sample_glb())
        self.assertEqual(faces, 1)
        self.assertTrue(changed)
        doc, _ = repair.parse_binary_glb(new)
        self.assertEqual(doc["accessors"][1]["count"], 3)
        self.assertEqual(doc["extras"]["art_approval"], False)
        self.assertEqual(doc["extras"]["coordinate_convention"], "GLTF_Y_UP_ROOT_ALIGNED_V1")
        self.assertEqual(len(doc["nodes"]), 2)
        self.assertEqual(doc["scenes"][0]["nodes"], [1])
        self.assertEqual(doc["nodes"][1]["children"], [0])
        self.assertAlmostEqual(doc["nodes"][1]["rotation"][0], -2 ** -0.5)

    def test_repair_is_idempotent(self):
        first, _, _ = repair.fix(sample_glb())
        second, count, changed = repair.fix(first)
        self.assertEqual(first, second)
        self.assertEqual(count, 0)
        self.assertFalse(changed)

    def test_rejects_100_percent_degenerate_mesh(self):
        with self.assertRaisesRegex(ValueError, "All indexed triangles"):
            repair.fix(sample_glb(all_degenerate=True))


if __name__ == "__main__":
    unittest.main()
