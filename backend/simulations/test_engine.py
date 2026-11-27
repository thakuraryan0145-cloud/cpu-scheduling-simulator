from django.test import TestCase
from simulations.engine import ALGORITHMS, simulate


STANDARD_PROCS = [
    {'pid': 'P1', 'arrival': 0, 'burst': 6, 'priority': 3},
    {'pid': 'P2', 'arrival': 1, 'burst': 4, 'priority': 1},
    {'pid': 'P3', 'arrival': 2, 'burst': 2, 'priority': 2},
]


class SchedulingEngineTests(TestCase):
    def test_fcfs_exact_metrics(self):
        out = simulate([
            {'pid': 'P1', 'arrival': 0, 'burst': 5, 'priority': 1},
            {'pid': 'P2', 'arrival': 1, 'burst': 3, 'priority': 1},
            {'pid': 'P3', 'arrival': 2, 'burst': 1, 'priority': 1},
        ], 'FCFS')
        by_pid = {r['pid']: r for r in out['results']}
        self.assertEqual(by_pid['P1']['completion'], 5)
        self.assertEqual(by_pid['P2']['completion'], 8)
        self.assertEqual(by_pid['P3']['completion'], 9)
        self.assertAlmostEqual(out['metrics']['avgWT'], (0 + 4 + 6) / 3)

    def test_sjf_and_srtf_calculations(self):
        procs = [
            {'pid': 'P1', 'arrival': 0, 'burst': 7},
            {'pid': 'P2', 'arrival': 2, 'burst': 4},
            {'pid': 'P3', 'arrival': 4, 'burst': 1},
            {'pid': 'P4', 'arrival': 5, 'burst': 4},
        ]
        sjf = simulate(procs, 'SJF')
        srtf = simulate(procs, 'SRTF')
        self.assertAlmostEqual(sjf['metrics']['avgWT'], 4.0)
        self.assertAlmostEqual(srtf['metrics']['avgWT'], 3.0)

    def test_hrrn_favors_waiting_short_job(self):
        procs = [
            {'pid': 'P1', 'arrival': 0, 'burst': 3},
            {'pid': 'P2', 'arrival': 2, 'burst': 6},
            {'pid': 'P3', 'arrival': 4, 'burst': 4},
            {'pid': 'P4', 'arrival': 6, 'burst': 5},
            {'pid': 'P5', 'arrival': 8, 'burst': 2},
        ]
        out = simulate(procs, 'HRRN')
        self.assertEqual(out['metrics']['makespan'], 20)
        self.assertAlmostEqual(out['metrics']['cpuUtil'], 100.0)

    def test_mlq_preempts_lower_queue(self):
        procs = [
            {'pid': 'P1', 'arrival': 0, 'burst': 6, 'priority': 4},  # Q2 (FCFS)
            {'pid': 'P2', 'arrival': 1, 'burst': 2, 'priority': 0},  # Q0 (RR)
        ]
        out = simulate(procs, 'MLQ', {'quantum': 2})
        by_pid = {r['pid']: r for r in out['results']}
        self.assertEqual(by_pid['P2']['completion'], 3)
        self.assertEqual(by_pid['P1']['completion'], 8)

    def test_mlfq_demotes_cpu_bound_process_and_aging_boosts(self):
        procs = [
            {'pid': 'P1', 'arrival': 0, 'burst': 7, 'priority': 1},
            {'pid': 'P2', 'arrival': 1, 'burst': 2, 'priority': 1},
        ]
        out = simulate(procs, 'MLFQ', {'quantum': 2, 'aging': True, 'agingInterval': 4})
        self.assertEqual(out['metrics']['makespan'], 9)
        self.assertEqual(len(out['results']), 2)

    def test_lottery_is_deterministic_with_seed_and_completes_all(self):
        r1 = simulate(STANDARD_PROCS, 'LOTTERY', {'quantum': 2, 'seed': 42})
        r2 = simulate(STANDARD_PROCS, 'LOTTERY', {'quantum': 2, 'seed': 42})
        self.assertEqual(r1['gantt'], r2['gantt'])
        self.assertEqual(r1['metrics']['makespan'], 12)

    def test_all_10_algorithms_complete_with_io_and_idle_gaps(self):
        procs = [
            {'pid': 'P1', 'arrival': 2, 'burst': 4, 'priority': 2, 'ioAt': 2, 'ioTime': 2},
            {'pid': 'P2', 'arrival': 3, 'burst': 3, 'priority': 1, 'ioAt': 0, 'ioTime': 0},
        ]
        for algo_id in ALGORITHMS:
            out = simulate(procs, algo_id, {'quantum': 2})
            self.assertEqual(len(out['results']), 2, f'Failed on {algo_id}')
            for r in out['results']:
                self.assertGreaterEqual(r['wt'], 0, f'Negative WT on {algo_id}')
                self.assertGreaterEqual(r['tat'], r['burst'], f'Invalid TAT on {algo_id}')

    def test_invalid_inputs_raise_value_error(self):
        with self.assertRaises(ValueError):
            simulate([], 'FCFS')
        with self.assertRaises(ValueError):
            simulate(STANDARD_PROCS, 'UNKNOWN_ALGO')
        with self.assertRaises(ValueError):
            simulate([{'pid': 'P1', 'arrival': 0, 'burst': 0}], 'FCFS')
