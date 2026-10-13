import copy
import unittest
from compare import compare_phase, indexed_meshes

class ComparisonTests(unittest.TestCase):
    def mesh(self):
        return [{'node': 'test_-1', 'skinned': True, 'surfaces': [{'vertices': [
            {'local': [0, 1, 0], 'world': [0, 1, 0], 'weights': [['joint', 1.0]]},
            {'local': [1, 1, 0], 'world': [1, 1, 0], 'weights': [['joint', 1.0]]}]}]}]

    def test_exact_weighted_vertices_pass(self):
        self.assertTrue(compare_phase(self.mesh(), self.mesh())['passed'])

    def test_world_transform_mismatch_fails(self):
        wrong = self.mesh()
        for v in wrong[0]['surfaces'][0]['vertices']:
            v['world'][0] += .01
        self.assertFalse(compare_phase(self.mesh(), wrong)['passed'])

    def test_vertex_order_mismatch_is_not_hidden(self):
        wrong = self.mesh()
        wrong[0]['surfaces'][0]['vertices'].reverse()
        with self.assertRaisesRegex(ValueError, 'correspondence|cannot be trusted'):
            compare_phase(self.mesh(), wrong)

    def test_mismatched_joint_is_rejected(self):
        wrong = self.mesh()
        wrong[0]['surfaces'][0]['vertices'][0]['weights'] = [['other', 1]]
        with self.assertRaisesRegex(ValueError, 'Joint correspondence'):
            compare_phase(self.mesh(), wrong)

    def test_name_normalization_preserves_negative_design_indices(self):
        other = copy.deepcopy(self.mesh()[0]); other['node'] = 'test_1'
        self.assertEqual(len(indexed_meshes(self.mesh() + [other])), 2)
        other['node'] = 'test-1'
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            indexed_meshes(self.mesh() + [other])

if __name__ == '__main__': unittest.main()
