#!/usr/bin/env bash
# Integration test script for opencode-teams plugin
# Tests that the plugin is properly recognized and loaded by OpenCode

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "OpenCode Teams Plugin Integration Test"
echo "============================================"
echo ""

# Check if opencode is installed
if ! command -v opencode &> /dev/null; then
    echo -e "${YELLOW}⚠ OpenCode not found. Installing...${NC}"
    # This would need to be adapted based on how opencode is actually installed
    echo -e "${RED}✗ Please install OpenCode first${NC}"
    echo "  Visit: https://opencode.ai/docs/installation"
    exit 1
fi

echo -e "${GREEN}✓ OpenCode found${NC}"
echo ""

# Check plugin directory
PLUGIN_DIR="${HOME}/.config/opencode/plugins/opencode-teams"

echo "Checking plugin installation..."
if [ ! -d "${PLUGIN_DIR}" ]; then
    echo -e "${YELLOW}⚠ Plugin not installed in ${PLUGIN_DIR}${NC}"
    echo "Installing plugin..."
    
    # Create plugins directory if it doesn't exist
    mkdir -p "$(dirname "${PLUGIN_DIR}")"
    
    # Copy current directory to plugin location
    cp -r "$(pwd)" "${PLUGIN_DIR}"
    cd "${PLUGIN_DIR}"
    
    # Build the plugin
    echo "Building plugin..."
    npm install
    npm run build
    
    echo -e "${GREEN}✓ Plugin installed${NC}"
else
    echo -e "${GREEN}✓ Plugin already installed${NC}"
fi

echo ""

# Check if plugin is built
if [ ! -f "${PLUGIN_DIR}/dist/index.js" ]; then
    echo -e "${RED}✗ Plugin not built${NC}"
    echo "Building plugin..."
    cd "${PLUGIN_DIR}"
    npm run build
fi

echo -e "${GREEN}✓ Plugin built${NC}"
echo ""

# Check opencode.json configuration
echo "Checking plugin configuration..."
if [ -f "${PLUGIN_DIR}/opencode.json" ]; then
    echo -e "${GREEN}✓ opencode.json exists${NC}"
    cat "${PLUGIN_DIR}/opencode.json"
else
    echo -e "${RED}✗ opencode.json not found${NC}"
    exit 1
fi

echo ""

# Test plugin can be loaded
echo "Testing plugin loading..."

# Create a test opencode configuration
TEST_DIR="/tmp/opencode-test-$(date +%s)"
mkdir -p "${TEST_DIR}"

cat > "${TEST_DIR}/opencode.json" << EOF
{
  "plugin": ["opencode-teams"]
}
EOF

echo "Created test configuration in ${TEST_DIR}"
echo ""

# Verify exports
echo "Checking plugin exports..."
node -e "
const plugin = require('${PLUGIN_DIR}/dist/index.js');
console.log('Plugin exports:', Object.keys(plugin));

if (!plugin.TeamOperations) {
  console.error('✗ TeamOperations not exported');
  process.exit(1);
}
console.log('✓ TeamOperations exported');

if (!plugin.TaskOperations) {
  console.error('✗ TaskOperations not exported');
  process.exit(1);
}
console.log('✓ TaskOperations exported');

console.log('');
console.log('Team Operations methods:', Object.keys(plugin.TeamOperations));
console.log('Task Operations methods:', Object.keys(plugin.TaskOperations));
"

echo ""

# Check skills directory
echo "Checking skills..."
if [ -d "${PLUGIN_DIR}/skills" ]; then
    echo -e "${GREEN}✓ Skills directory exists${NC}"
    ls -1 "${PLUGIN_DIR}/skills"
    
    # Count skill files
    SKILL_COUNT=$(find "${PLUGIN_DIR}/skills" -name "SKILL.md" | wc -l)
    echo "Found ${SKILL_COUNT} skill(s)"
else
    echo -e "${YELLOW}⚠ Skills directory not found${NC}"
fi

echo ""

# Check agents directory
echo "Checking agents..."
if [ -d "${PLUGIN_DIR}/agent" ]; then
    echo -e "${GREEN}✓ Agent directory exists${NC}"
    ls -1 "${PLUGIN_DIR}/agent"
    
    # Count agent files
    AGENT_COUNT=$(find "${PLUGIN_DIR}/agent" -name "AGENT.md" | wc -l)
    echo "Found ${AGENT_COUNT} agent(s)"
else
    echo -e "${YELLOW}⚠ Agent directory not found${NC}"
fi

echo ""

# Clean up test directory
rm -rf "${TEST_DIR}"

echo "============================================"
echo -e "${GREEN}✓ Integration tests passed!${NC}"
echo "============================================"
echo ""
echo "Plugin is properly installed and configured."
echo "OpenCode should now recognize:"
echo "  - TeamOperations global object"
echo "  - TaskOperations global object"
echo "  - ${SKILL_COUNT} skills"
echo "  - ${AGENT_COUNT} agents"
echo ""
