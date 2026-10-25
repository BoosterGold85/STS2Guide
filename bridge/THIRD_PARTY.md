# Source reference

Game API usage was researched in https://github.com/Gennadiyev/STS2MCP
commit 55e064850a68f3b4cde7e5fd525bf9b2dec4e885. No action or UI builder files are
included. Attribution and the MIT notice follow for adapted API integration patterns.
Copyright 2026 Yikun Ji (Kunologist)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The route-coach preview adapts the BuildMapState/BuildMapNode graph-reading pattern
from the user's uploaded STS2MCP-main.zip (0.4.0; relevant files identical to the
commit above). It observes NMapPoint travelability without opening UI or clicking.
The original shop, treasure, action, and state-dispatch implementations are excluded.
