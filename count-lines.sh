#!/bin/bash

# Conduit - Lines of Code Counter
# Counts lines of code in the project, excluding common non-code directories

echo "======================================"
echo "🚀 Conduit - Lines of Code Report"
echo "======================================"
echo ""

# Function to count lines in specific file types
count_lines() {
    local pattern="$1"
    local description="$2"
    
    # Find files matching pattern, excluding node_modules, dist, build, etc.
    local count=$(find . -type f -name "$pattern" \
        -not -path "./node_modules/*" \
        -not -path "./dist/*" \
        -not -path "./build/*" \
        -not -path "./.git/*" \
        -not -path "./coverage/*" \
        -not -path "./test-results/*" \
        -not -path "./playwright-report/*" \
        -not -path "./.playwright/*" \
        -not -path "./.vite/*" \
        -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')
    
    if [ -z "$count" ] || [ "$count" = "0" ]; then
        count="0"
    fi
    
    printf "%-30s %8s lines\n" "$description:" "$count"
    return $count
}

# Count different file types
echo "📊 Code Statistics by File Type:"
echo "---------------------------------"

total=0

# TypeScript (main language)
count_lines "*.ts" "TypeScript (.ts)"
total=$((total + $?))

# JavaScript (minimal, mainly scripts)
count_lines "*.js" "JavaScript (.js)"
total=$((total + $?))

# Configuration
count_lines "*.json" "JSON (.json)"
total=$((total + $?))

count_lines "*.yaml" "YAML (.yaml)"
total=$((total + $?))

count_lines "*.yml" "YAML (.yml)"
total=$((total + $?))

# Documentation
count_lines "*.md" "Markdown (.md)"
total=$((total + $?))

# Docker
count_lines "Dockerfile*" "Dockerfile"
total=$((total + $?))

# Test files
echo ""
echo "🧪 Test Files:"
echo "---------------------------------"
test_count=$(find . -type f -name "*.test.ts" \
    -not -path "./node_modules/*" \
    -not -path "./dist/*" \
    -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')

if [ -z "$test_count" ]; then
    test_count="0"
fi

printf "%-30s %8s lines\n" "Test files (.test.ts):" "$test_count"

# Source code only (excluding tests and configs)
echo ""
echo "💻 Source Code Analysis:"
echo "---------------------------------"

src_ts=$(find ./src -type f -name "*.ts" \
    -not -name "*.test.ts" \
    -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')

if [ -z "$src_ts" ]; then
    src_ts="0"
fi

printf "%-30s %8s lines\n" "Source TypeScript:" "$src_ts"

# Scripts
scripts_count=$(find ./scripts -type f -name "*.ts" \
    -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')

if [ -z "$scripts_count" ]; then
    scripts_count="0"
fi

printf "%-30s %8s lines\n" "Scripts (.ts):" "$scripts_count"

# Directory breakdown
echo ""
echo "📁 Directory Breakdown:"
echo "---------------------------------"

for dir in src tests scripts docs examples; do
    if [ -d "$dir" ]; then
        dir_count=$(find ./$dir -type f \( -name "*.ts" -o -name "*.js" -o -name "*.md" \) \
            -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')

        if [ -z "$dir_count" ]; then
            dir_count="0"
        fi

        printf "%-30s %8s lines\n" "$dir/:" "$dir_count"
    fi
done

# File count
echo ""
echo "📄 File Count:"
echo "---------------------------------"

ts_files=$(find . -type f -name "*.ts" \
    -not -path "./node_modules/*" \
    -not -path "./dist/*" \
    -not -path "./.git/*" | wc -l)

test_files=$(find . -type f -name "*.test.ts" \
    -not -path "./node_modules/*" | wc -l)

md_files=$(find . -type f -name "*.md" \
    -not -path "./node_modules/*" \
    -not -path "./.git/*" | wc -l)

total_files=$(find . -type f \
    -not -path "./node_modules/*" \
    -not -path "./dist/*" \
    -not -path "./.git/*" \
    -not -path "./build/*" \
    -not -path "./coverage/*" | wc -l)

printf "%-30s %8s files\n" "TypeScript files:" "$ts_files"
printf "%-30s %8s files\n" "Test files:" "$test_files"
printf "%-30s %8s files\n" "Markdown docs:" "$md_files"
printf "%-30s %8s files\n" "Total project files:" "$total_files"

# Summary
echo ""
echo "======================================"
echo "📈 Summary"
echo "======================================"

total_lines=$(find . -type f \( -name "*.ts" -o -name "*.js" \) \
    -not -path "./node_modules/*" \
    -not -path "./dist/*" \
    -not -path "./build/*" \
    -not -path "./.git/*" \
    -exec wc -l {} + 2>/dev/null | tail -1 | awk '{print $1}')

if [ -z "$total_lines" ]; then
    total_lines="0"
fi

echo "Total Lines of Code: $total_lines"
echo "Source Code Lines: $src_ts"
echo "Test Code Lines: $test_count"
echo "Scripts Lines: $scripts_count"

if [ "$src_ts" -gt 0 ] && [ "$test_count" -gt 0 ]; then
    test_ratio=$(echo "scale=2; $test_count * 100 / $src_ts" | bc 2>/dev/null || echo "N/A")
    echo "Test Coverage Ratio: ${test_ratio}% (test lines / source lines)"
fi

# Test count
test_file_count=$(find ./tests -type f -name "*.test.ts" 2>/dev/null | wc -l)
if [ ! -z "$test_file_count" ] && [ "$test_file_count" -gt 0 ]; then
    echo "Total Test Files: $test_file_count"
fi

echo ""
echo "Report generated on: $(date)"
echo ""
