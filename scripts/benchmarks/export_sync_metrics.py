#!/usr/bin/env python3
"""
LaTeX & Markdown Benchmark Metric Exporter
Processes benchmark run logs and generates IEEE double-column LaTeX comparison tables
and plots Staleness vs. Packet Loss % curves for thesis publication.
"""

import json
import matplotlib.pyplot as plt
import numpy as np
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

class SyncMetricsExporter:
    def __init__(self, benchmark_json_path: str = "results/benchmarks/edge_sync_results.json", 
                 output_dir: str = "results/thesis"):
        self.benchmark_json_path = Path(benchmark_json_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Load benchmark results
        if not self.benchmark_json_path.exists():
            raise FileNotFoundError(f"Benchmark results not found at {self.benchmark_json_path}")
        
        with open(self.benchmark_json_path, 'r') as f:
            self.benchmark_data = json.load(f)
        
        print(f"Loaded benchmark results from {self.benchmark_json_path}")
    
    def generate_markdown_comparison_table(self) -> str:
        """Generate Markdown comparison table for network profiles."""
        markdown = "# Edge Sync Benchmark Results\n\n"
        markdown += "| Network Profile | Encoder | Success Rate | Bandwidth (KB) | Avg Latency (ms) | Staleness (ms) |\n"
        markdown += "|-----------------|---------|--------------|----------------|------------------|----------------|\n"
        
        for profile, data in self.benchmark_data.get('profiles', {}).items():
            for encoder in ['mqtt_binary', 'json']:
                encoder_data = data[encoder]
                encoder_name = "MQTT Binary" if encoder == 'mqtt_binary' else "JSON"
                
                markdown += f"| {profile} | {encoder_name} | {encoder_data['success_rate']:.4f} | "
                markdown += f"{encoder_data['bandwidth_kb']:.2f} | {encoder_data['avg_latency_ms']:.2f} | "
                markdown += f"{encoder_data['staleness_ms']:.2f} |\n"
        
        return markdown
    
    def generate_latex_comparison_table(self) -> str:
        """Generate LaTeX comparison table for IEEE double-column format."""
        latex = "\\begin{table}[htbp]\n"
        latex += "\\centering\n"
        latex += "\\caption{Edge Sync Performance Comparison Across Network Profiles}\n"
        latex += "\\label{tab:edge_sync_comparison}\n"
        latex += "\\resizebox{\\columnwidth}{!}{\n"
        latex += "\\begin{tabular}{lccccc}\n"
        latex += "\\hline\n"
        latex += "Network Profile & Encoder & Success Rate & Bandwidth (KB) & Avg Latency (ms) & Staleness (ms) \\\\\n"
        latex += "\\hline\n"
        
        profiles = list(self.benchmark_data.get('profiles', {}).keys())
        for i, profile in enumerate(profiles):
            data = self.benchmark_data['profiles'][profile]
            
            # MQTT Binary row
            mqtt_data = data['mqtt_binary']
            latex += f"{profile} & MQTT Binary & {mqtt_data['success_rate']:.4f} & "
            latex += f"{mqtt_data['bandwidth_kb']:.2f} & {mqtt_data['avg_latency_ms']:.2f} & "
            latex += f"{mqtt_data['staleness_ms']:.2f} \\\\\n"
            
            # JSON row
            json_data = data['json']
            latex += f" & JSON & {json_data['success_rate']:.4f} & "
            latex += f"{json_data['bandwidth_kb']:.2f} & {json_data['avg_latency_ms']:.2f} & "
            latex += f"{json_data['staleness_ms']:.2f} \\\\\n"
            
            if i < len(profiles) - 1:
                latex += "\\hline\n"
        
        latex += "\\hline\n"
        latex += "\\end{tabular}\n"
        latex += "}\n"
        latex += "\\end{table}\n"
        
        return latex
    
    def generate_improvement_table(self) -> str:
        """Generate improvement table comparing MQTT Binary vs JSON."""
        markdown = "# MQTT Binary vs JSON Improvements\n\n"
        markdown += "| Network Profile | Bandwidth Savings (%) | Staleness Improvement (%) | Success Rate Improvement (%) |\n"
        markdown += "|-----------------|----------------------|----------------------------|-------------------------------|\n"
        
        improvements = self.calculate_improvements()
        
        for profile, improvement in improvements.items():
            markdown += f"| {profile} | {improvement['bandwidth_savings']:.2f} | "
            markdown += f"{improvement['staleness_improvement']:.2f} | "
            markdown += f"{improvement['success_rate_improvement']:.2f} |\n"
        
        return markdown
    
    def generate_improvement_latex_table(self) -> str:
        """Generate LaTeX improvement table."""
        latex = "\\begin{table}[htbp]\n"
        latex += "\\centering\n"
        latex += "\\caption{MQTT Binary Encoder Improvements over JSON Baseline}\n"
        latex += "\\label{tab:mqtt_improvements}\n"
        latex += "\\resizebox{\\columnwidth}{!}{\n"
        latex += "\\begin{tabular}{lccc}\n"
        latex += "\\hline\n"
        latex += "Network Profile & Bandwidth Savings (\\%) & Staleness Improvement (\\%) & Success Rate Improvement (\\%) \\\\\n"
        latex += "\\hline\n"
        
        improvements = self.calculate_improvements()
        
        for profile, improvement in improvements.items():
            latex += f"{profile} & {improvement['bandwidth_savings']:.2f} & "
            latex += f"{improvement['staleness_improvement']:.2f} & "
            latex += f"{improvement['success_rate_improvement']:.2f} \\\\\n"
        
        latex += "\\hline\n"
        latex += "\\end{tabular}\n"
        latex += "}\n"
        latex += "\\end{table}\n"
        
        return latex
    
    def calculate_improvements(self) -> Dict[str, Dict[str, float]]:
        """Calculate improvements of MQTT Binary over JSON."""
        improvements = {}
        
        for profile, data in self.benchmark_data.get('profiles', {}).items():
            mqtt_data = data['mqtt_binary']
            json_data = data['json']
            
            bandwidth_savings = ((json_data['bandwidth_kb'] - mqtt_data['bandwidth_kb']) / json_data['bandwidth_kb']) * 100
            staleness_improvement = ((json_data['staleness_ms'] - mqtt_data['staleness_ms']) / json_data['staleness_ms']) * 100
            success_rate_improvement = ((mqtt_data['success_rate'] - json_data['success_rate']) / json_data['success_rate']) * 100
            
            improvements[profile] = {
                'bandwidth_savings': bandwidth_savings,
                'staleness_improvement': staleness_improvement,
                'success_rate_improvement': success_rate_improvement
            }
        
        return improvements
    
    def plot_staleness_vs_packet_loss(self):
        """Plot Staleness vs. Packet Loss % curves for thesis publication."""
        profiles = ['optimal_fiber', 'urban_4g', 'degraded_3g_edge', 'monsoon_spotty']
        packet_loss_rates = [0.001, 0.02, 0.15, 0.35]  # From network profiles
        
        mqtt_staleness = []
        json_staleness = []
        
        for profile in profiles:
            data = self.benchmark_data['profiles'][profile]
            mqtt_staleness.append(data['mqtt_binary']['staleness_ms'])
            json_staleness.append(data['json']['staleness_ms'])
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        # Plot MQTT Binary
        ax.plot(packet_loss_rates, mqtt_staleness, 'o-', label='MQTT Binary (50-byte)', linewidth=2, markersize=8)
        
        # Plot JSON
        ax.plot(packet_loss_rates, json_staleness, 's--', label='JSON Baseline (~600-byte)', linewidth=2, markersize=8)
        
        ax.set_xlabel('Packet Loss Rate (%)', fontsize=12)
        ax.set_ylabel('Mean State Staleness (ms)', fontsize=12)
        ax.set_title('State Staleness vs. Packet Loss Rate', fontsize=14, fontweight='bold')
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)
        
        # Format x-axis as percentage
        ax.set_xticklabels([f'{x*100:.1f}%' for x in packet_loss_rates])
        
        plt.tight_layout()
        output_path = self.output_dir / "staleness_vs_packet_loss.png"
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"Staleness vs. Packet Loss plot saved to {output_path}")
        plt.close()
    
    def plot_bandwidth_comparison(self):
        """Plot bandwidth consumption comparison."""
        profiles = ['optimal_fiber', 'urban_4g', 'degraded_3g_edge', 'monsoon_spotty']
        
        mqtt_bandwidth = []
        json_bandwidth = []
        
        for profile in profiles:
            data = self.benchmark_data['profiles'][profile]
            mqtt_bandwidth.append(data['mqtt_binary']['bandwidth_kb'])
            json_bandwidth.append(data['json']['bandwidth_kb'])
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        x = np.arange(len(profiles))
        width = 0.35
        
        bars1 = ax.bar(x - width/2, mqtt_bandwidth, width, label='MQTT Binary (50-byte)', color='blue', alpha=0.7)
        bars2 = ax.bar(x + width/2, json_bandwidth, width, label='JSON Baseline (~600-byte)', color='orange', alpha=0.7)
        
        ax.set_xlabel('Network Profile', fontsize=12)
        ax.set_ylabel('Total Bandwidth (KB)', fontsize=12)
        ax.set_title('Bandwidth Consumption Comparison', fontsize=14, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(profiles, rotation=45, ha='right')
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3, axis='y')
        
        # Add value labels on bars
        ax.bar_label(bars1, padding=3, fontsize=9)
        ax.bar_label(bars2, padding=3, fontsize=9)
        
        plt.tight_layout()
        output_path = self.output_dir / "bandwidth_comparison.png"
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"Bandwidth comparison plot saved to {output_path}")
        plt.close()
    
    def plot_success_rate_comparison(self):
        """Plot delivery success rate comparison."""
        profiles = ['optimal_fiber', 'urban_4g', 'degraded_3g_edge', 'monsoon_spotty']
        
        mqtt_success = []
        json_success = []
        
        for profile in profiles:
            data = self.benchmark_data['profiles'][profile]
            mqtt_success.append(data['mqtt_binary']['success_rate'] * 100)
            json_success.append(data['json']['success_rate'] * 100)
        
        fig, ax = plt.subplots(figsize=(10, 6))
        
        x = np.arange(len(profiles))
        width = 0.35
        
        bars1 = ax.bar(x - width/2, mqtt_success, width, label='MQTT Binary (50-byte)', color='green', alpha=0.7)
        bars2 = ax.bar(x + width/2, json_success, width, label='JSON Baseline (~600-byte)', color='red', alpha=0.7)
        
        ax.set_xlabel('Network Profile', fontsize=12)
        ax.set_ylabel('Delivery Success Rate (%)', fontsize=12)
        ax.set_title('Delivery Success Rate Comparison', fontsize=14, fontweight='bold')
        ax.set_xticks(x)
        ax.set_xticklabels(profiles, rotation=45, ha='right')
        ax.legend(fontsize=10)
        ax.set_ylim([0, 100])
        ax.grid(True, alpha=0.3, axis='y')
        
        # Add value labels on bars
        ax.bar_label(bars1, padding=3, fmt='%.1f%%', fontsize=9)
        ax.bar_label(bars2, padding=3, fmt='%.1f%%', fontsize=9)
        
        plt.tight_layout()
        output_path = self.output_dir / "success_rate_comparison.png"
        plt.savefig(output_path, dpi=300, bbox_inches='tight')
        print(f"Success rate comparison plot saved to {output_path}")
        plt.close()
    
    def generate_thesis_document(self):
        """Generate complete LaTeX thesis document with all tables and figures."""
        latex_document = f"""
\\documentclass[conference]{{IEEEtran}}
\\usepackage{{graphicx}}
\\usepackage{{booktabs}}
\\usepackage{{adjustbox}}

\\title{{Constrained-Bandwidth Edge Synchronization for Smart Parking Systems}}
\\author{{SLOTS Research Team}}
\\date{{\\today}}

\\begin{{document}}

\\maketitle

\\section{{Introduction}}
This document presents benchmark results for edge-to-cloud synchronization under simulated Indian network conditions, comparing a compact 50-byte MQTT QoS-1 encoding against a standard full-payload JSON baseline.

\\section{{Experimental Setup}}
The benchmark simulates 10,000 occupancy transition events across four network profiles representing realistic Indian conditions: optimal fiber, urban 4G, degraded 3G edge, and monsoon spotty connectivity.

\\section{{Performance Comparison}}
{self.generate_latex_comparison_table()}

\\section{{MQTT Binary Improvements}}
{self.generate_improvement_latex_table()}

\\section{{State Staleness Analysis}}
\\begin{{figure}}[htbp]
\\centering
\\includegraphics[width=\\columnwidth]{{staleness_vs_packet_loss.png}}
\\caption{{State Staleness vs. Packet Loss Rate}}
\\label{{fig:staleness_packet_loss}}
\\end{{figure}}

\\section{{Bandwidth Consumption}}
\\begin{{figure}}[htbp]
\\centering
\\includegraphics[width=\\columnwidth]{{bandwidth_comparison.png}}
\\caption{{Bandwidth Consumption Comparison}}
\\label{{fig:bandwidth_comparison}}
\\end{{figure}}

\\section{{Delivery Success Rate}}
\\begin{{figure}}[htbp]
\\centering
\\includegraphics[width=\\columnwidth]{{success_rate_comparison.png}}
\\caption{{Delivery Success Rate Comparison}}
\\label{{fig:success_rate}}
\\end{{figure}}

\\section{{Conclusion}}
The compact 50-byte MQTT encoding demonstrates significant bandwidth savings ({self.benchmark_data['summary']['overallBandwidthSavings']:.2f}%) and reduced state staleness ({self.benchmark_data['summary']['overallStalenessImprovement']:.2f}%) compared to the JSON baseline, particularly under degraded network conditions (35% packet loss). This validates the effectiveness of binary encoding for constrained-bandwidth edge deployments in Indian smart parking systems.

\\end{{document}}
"""
        
        latex_path = self.output_dir / "edge_sync_thesis.tex"
        with open(latex_path, 'w') as f:
            f.write(latex_document)
        
        print(f"LaTeX thesis document saved to {latex_path}")
    
    def export_all(self):
        """Export all metrics, tables, and figures."""
        print("=== Edge Sync Metrics Exporter ===")
        print(f"Output directory: {self.output_dir}")
        
        # Generate tables
        markdown_comparison = self.generate_markdown_comparison_table()
        markdown_improvement = self.generate_improvement_table()
        
        latex_comparison = self.generate_latex_comparison_table()
        latex_improvement = self.generate_improvement_latex_table()
        
        # Save tables
        with open(self.output_dir / "sync_comparison_table.md", 'w') as f:
            f.write(markdown_comparison)
        with open(self.output_dir / "sync_improvement_table.md", 'w') as f:
            f.write(markdown_improvement)
        
        with open(self.output_dir / "sync_comparison_table.tex", 'w') as f:
            f.write(latex_comparison)
        with open(self.output_dir / "sync_improvement_table.tex", 'w') as f:
            f.write(latex_improvement)
        
        print("Tables generated:")
        print("  - sync_comparison_table.md/tex")
        print("  - sync_improvement_table.md/tex")
        
        # Generate plots
        self.plot_staleness_vs_packet_loss()
        self.plot_bandwidth_comparison()
        self.plot_success_rate_comparison()
        
        print("Plots generated:")
        print("  - staleness_vs_packet_loss.png")
        print("  - bandwidth_comparison.png")
        print("  - success_rate_comparison.png")
        
        # Generate thesis document
        self.generate_thesis_document()
        
        print(f"\nAll outputs saved to {self.output_dir}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Export edge sync benchmark metrics for thesis publication")
    parser.add_argument("--benchmark-json", default="results/benchmarks/edge_sync_results.json", 
                        help="Path to benchmark results JSON")
    parser.add_argument("--output-dir", default="results/thesis", help="Output directory for thesis materials")
    
    args = parser.parse_args()
    
    exporter = SyncMetricsExporter(
        benchmark_json_path=args.benchmark_json,
        output_dir=args.output_dir
    )
    
    exporter.export_all()


if __name__ == "__main__":
    main()