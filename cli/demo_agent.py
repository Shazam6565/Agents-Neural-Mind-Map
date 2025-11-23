#!/usr/bin/env python3
"""
Demo script to run the LangGraph agent with a sample task.
This will generate reasoning traces that the Mind Map dashboard can visualize.
"""

import json
import os
import sys

# Add the cli directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def create_demo_reasoning_trace(output_path):
    """Create a demo reasoning trace for testing the dashboard."""
    
    reasoning_steps = [
        {
            "step": 1,
            "thought": "I need to analyze the portfolio project structure to understand the codebase",
            "decision": "Start by examining the main entry point and configuration files",
            "file_examined": "package.json",
            "alternatives_considered": [
                "Start with the README documentation",
                "Begin with the source code directly",
                "Review the build configuration first"
            ]
        },
        {
            "step": 2,
            "thought": "The package.json shows this is a React/TypeScript project with Vite",
            "decision": "Next, I should review the main App component to understand the structure",
            "file_examined": "src/App.tsx",
            "alternatives_considered": [
                "Check the routing configuration first",
                "Review the component library",
                "Examine the styling setup"
            ]
        },
        {
            "step": 3,
            "thought": "I can see the app has multiple sections: Hero, About, Projects, Skills, Contact",
            "decision": "Let's enhance the Projects section with better animations and interactivity",
            "file_examined": "src/components/Projects.tsx",
            "alternatives_considered": [
                "Improve the Hero section first",
                "Add new features to Skills section",
                "Enhance the Contact form"
            ]
        },
        {
            "step": 4,
            "thought": "The Projects component could benefit from card hover effects and modal previews",
            "decision": "Implement glassmorphism design with smooth transitions",
            "file_examined": "src/components/ProjectCard.tsx",
            "alternatives_considered": [
                "Use a carousel layout instead",
                "Implement a grid with filters",
                "Create a timeline view"
            ]
        },
        {
            "step": 5,
            "thought": "The styling needs to be consistent with modern design trends",
            "decision": "Update the CSS to use CSS Grid and Flexbox with proper spacing",
            "file_examined": "src/styles/projects.css",
            "alternatives_considered": [
                "Use Tailwind CSS instead",
                "Implement CSS-in-JS with styled-components",
                "Keep the current approach but refine it"
            ]
        }
    ]
    
    # Write the reasoning trace
    with open(output_path, 'w') as f:
        json.dump(reasoning_steps, f, indent=2)
    
    print(f"✓ Created demo reasoning trace with {len(reasoning_steps)} steps")
    print(f"  Location: {output_path}")
    return reasoning_steps

if __name__ == "__main__":
    # Get the reasoning trace path from environment or use default
    reasoning_trace_path = os.getenv(
        'REASONING_TRACE_PATH',
        '/Users/shauryatiwari/Desktop/Hackathon Demo/Shaurya-Portfolio/reasoning_trace.json'
    )
    
    print("🤖 LangGraph Agent Demo")
    print("=" * 50)
    print(f"Output: {reasoning_trace_path}")
    print()
    
    # Create the demo reasoning trace
    steps = create_demo_reasoning_trace(reasoning_trace_path)
    
    print()
    print("✅ Demo complete!")
    print()
    print("Next steps:")
    print("1. Check the Mind Map dashboard at http://localhost:3000")
    print("2. You should see a new session appear")
    print("3. Click on the session to view the reasoning mind map")
    print("4. Try the pause/resume/rollback controls")
