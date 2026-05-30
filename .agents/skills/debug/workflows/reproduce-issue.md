# Reproduction Workflow

## 1. Isolate the Variable
- Can you reproduce it in a different browser?
- Can you reproduce it with a different user?
- Can you reproduce it locally vs prod?

## 2. Create Minimal Reproduction
Try to strip away all unnecessary complexity.

**Frontend:**
- Create a test case in a relevant `.test.tsx` file that mimics the user interaction.

**Backend:**
- Create a test case or a minimal script that triggers the API call.

## 3. Tools
Use these to help:
- `npm run test` (Run unit tests)
- MCP `call_tool_compound_manager` { action: "search", terms: ["error message keywords"] } (Search for known solutions)
