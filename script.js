// Coze工作流调用器 - 代理模式专用版本
// 修复CORS问题，直接使用代理服务器

// SSE流处理函数
async function streamSSE(url, fetchOptions = {}, callbacks = {}) {
    const { onEvent = () => {}, onMessage = () => {}, onError = () => {} } = callbacks;
    
    try {
        const resp = await fetch(url, {
            method: fetchOptions.method || 'GET',
            headers: fetchOptions.headers,
            body: fetchOptions.body,
            signal: fetchOptions.signal,
            ...fetchOptions,
        });

        if (!resp.ok) {
            const text = await resp.text();
            console.error('SSE请求失败:', resp.status, resp.statusText, text?.slice?.(0, 200));
            throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        const reader = resp.body?.getReader?.();
        if (!reader) {
            throw new Error('响应体不支持Reader');
        }

        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let currentEventName = null;
        let currentDataLines = [];
        let finalResult = undefined;

        const finalizeEvent = () => {
            if (currentDataLines.length === 0) return;
            const dataContent = currentDataLines.join('\n');
            currentDataLines = [];
            
            try {
                if (dataContent === '[DONE]') return;
                
                // 尝试解析JSON
                const looksJson = /^(\s*[\[{])/.test(dataContent);
                if (looksJson) {
                    try {
                        const jsonData = JSON.parse(dataContent);
                        console.log('SSE事件:', currentEventName || 'message', jsonData);
                        onEvent(currentEventName || 'message', dataContent, jsonData);
                        
                        // 检查是否是最终结果
                        if (jsonData.event === 'workflow.finish' || 
                            jsonData.event === 'workflow.run.finish' ||
                            jsonData.output || jsonData.data || jsonData.content) {
                            finalResult = jsonData;
                        }
                    } catch (e) {
                        console.warn('JSON解析失败:', dataContent.slice(0, 200), e);
                        onEvent(currentEventName || 'message', dataContent, null);
                    }
                } else {
                    console.debug('非JSON数据:', dataContent.slice(0, 120));
                    onEvent(currentEventName || 'message', dataContent, null);
                }
            } catch (e) {
                console.warn('事件处理失败:', e);
            }
            currentEventName = null;
        };

        // 读取流数据
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            onMessage(chunk);

            let idx;
            while ((idx = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 1);

                const trimmed = line.replace(/\r$/, '');
                if (trimmed === '') {
                    finalizeEvent();
                    continue;
                }

                if (trimmed.startsWith('event:')) {
                    currentEventName = trimmed.slice(6).trim();
                    continue;
                }

                if (trimmed.startsWith('data:')) {
                    currentDataLines.push(trimmed.slice(5).trim());
                    continue;
                }
            }
        }

        // 处理剩余数据
        finalizeEvent();
        return finalResult;
        
    } catch (error) {
        console.error('SSE流处理错误:', error);
        onError(error);
        throw error;
    }
}

// 页面初始化
(function initUI() {
    const els = {
        input: document.getElementById('input'),
        feishu: document.getElementById('feishu_token'),
        workflow: document.getElementById('workflow_id'),
        token: document.getElementById('api_token'),
        num: document.getElementById('num'),
        execBtn: document.getElementById('executeBtn'),
        copyBtn: document.getElementById('copyBtn'),
        resultSection: document.getElementById('resultSection'),
        resultContent: document.getElementById('resultContent'),
        resultDebug: document.getElementById('resultDebug'),
        status: document.getElementById('statusMessage')
    };

    // 执行按钮点击事件
    els.execBtn?.addEventListener('click', async () => {
        try {
            toggleLoading(true);
            clearResult();
            setStatus('正在校验参数…', 'info');

            // 参数校验
            const token = (els.token?.value || '').trim();
            const workflow_id = (els.workflow?.value || '').trim();
            const input = (els.input?.value || '').trim();
            const numRaw = (els.num?.value || '').trim();
            const feishu_token = (els.feishu?.value || '').trim();

            if (!token) throw new Error('请先填写 API Token');
            if (!workflow_id) throw new Error('请填写工作流ID');
            if (!input) throw new Error('请输入要处理的内容');

            const NUM = Math.max(1, Math.min(10, parseInt(numRaw || '2', 10) || 2));

            const payload = {
                workflow_id,
                parameters: {
                    input,
                    NUM,
                    ...(feishu_token ? { feishu_token } : {}),
                },
            };

            setStatus('正在调用Coze工作流（代理模式）…', 'info');

            // 记录开始时间
            const startTime = new Date();
            
            // 直接使用代理模式，避免CORS问题
            const url = 'http://localhost:8001/v1/workflow/stream_run';
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream, application/json;q=0.9, */*;q=0.8',
                'Cache-Control': 'no-store',
            };

            console.log('发送请求到代理服务器:', url);
            console.log('请求头:', headers);
            console.log('请求体:', JSON.stringify(payload, null, 2));

            let collectedLogs = [];
            let eventCount = 0;
            let lastResult = null;
            
            // 通过代理调用Coze API
            const result = await streamSSE(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            }, {
                onEvent: (evt, data, json) => {
                    eventCount++;
                    console.log(`SSE事件 #${eventCount}:`, evt, json || data.slice(0, 200));
                    
                    // 收集重要事件
                    if (json) {
                        collectedLogs.push(`[${evt}] ${JSON.stringify(json).slice(0, 100)}`);
                        lastResult = json; // 保存最后一个有效结果
                        
                        // 检查是否是最终结果
                        if (evt === 'workflow.finish' || evt === 'workflow.run.finish' || 
                            (json.event && (json.event.includes('finish') || json.event.includes('complete')))) {
                            console.log('检测到工作流完成事件:', json);
                        }
                    } else if (data) {
                        const snip = data.slice(0, 120);
                        collectedLogs.push(`[${evt}] ${snip}`);
                    }
                    
                    // 更新状态
                    if (eventCount % 5 === 0) {
                        setStatus(`工作流执行中…已接收事件 ${eventCount}`, 'info');
                    }
                },
                onMessage: (chunk) => {
                    console.debug('SSE原始数据块:', chunk.slice(0, 100));
                },
                onError: (e) => {
                    console.error('SSE回调错误:', e);
                    setStatus(`SSE错误: ${e.message}`, 'error');
                },
            });

            setStatus('正在处理返回结果…', 'info');
            console.log('SSE流处理完成，最终结果:', result);
            console.log('收集的日志:', collectedLogs);
            
            // 使用最终结果或最后一个有效结果
            const finalResult = result || lastResult;
            
            if (!finalResult && collectedLogs.length === 0) {
                throw new Error('未收到工作流执行结果，请检查API Token和工作流ID是否正确');
            }
            
            // 渲染结果
            renderResult(finalResult, collectedLogs, startTime);
            setStatus('执行成功（通过代理模式）', 'success');
            
        } catch (err) {
            console.error('执行错误:', err);
            const msg = err?.message || '执行失败';
            setStatus(msg, 'error');
        } finally {
            toggleLoading(false);
        }
    });

    // 复制按钮点击事件
    els.copyBtn?.addEventListener('click', async () => {
        const text = getCopyText();
        try {
            await navigator.clipboard.writeText(text);
            setStatus('结果已复制到剪贴板', 'success');
        } catch {
            setStatus('复制失败，请手动选择内容复制', 'error');
        }
    });

    // 工具函数
    function toggleLoading(loading) {
        if (!els.execBtn) return;
        els.execBtn.classList.toggle('loading', !!loading);
    }

    function setStatus(message, type) {
        if (!els.status) return;
        els.status.textContent = message;
        els.status.classList.remove('hidden');
        els.status.classList.remove('success', 'error', 'info');
        els.status.classList.add(type || 'info');
    }

    function clearResult() {
        if (els.resultSection) els.resultSection.classList.add('hidden');
        if (els.resultContent) els.resultContent.textContent = '';
        if (els.resultDebug) els.resultDebug.textContent = '';
    }

    function renderResult(result, logs, startTime) {
        try {
            const endTime = new Date();
            const executionTime = startTime ? Math.round((endTime - startTime) / 1000) : 0;
            
            // 提取主要内容
            let mainContent = '';
            if (result) {
                mainContent = extractMainContent(result);
            } else if (logs.length > 0) {
                mainContent = '从执行日志中提取的信息:\n' + logs.slice(-3).join('\n');
            } else {
                mainContent = '暂无内容';
            }
            
            // 格式化显示内容
            let formattedContent = `📝 处理结果:\n${mainContent}\n\n`;
            formattedContent += `⏰ 执行时间：${endTime.toLocaleString('zh-CN')}\n`;
            formattedContent += `⚡ 耗时：${executionTime} 秒`;
            
            if (els.resultContent) {
                els.resultContent.style.whiteSpace = 'pre-line';
                els.resultContent.textContent = formattedContent;
            }
            
            // 显示调试链接
            if (els.resultDebug) {
                const debug_url = result?.debug_url || result?.debug;
                if (debug_url) {
                    els.resultDebug.innerHTML = `<a href="${escapeHtml(debug_url)}" target="_blank">🔍 查看调试详情</a>`;
                } else {
                    els.resultDebug.textContent = '暂无调试链接';
                }
            }
            
            if (els.resultSection) els.resultSection.classList.remove('hidden');
            
        } catch (e) {
            console.warn('结果渲染异常:', e);
        }
    }
    
    function extractMainContent(result) {
        try {
            if (typeof result === 'string') {
                return result.trim();
            }
            
            // 尝试从不同的数据结构中提取内容
            if (result?.output?.nodes?.length) {
                const resultNode = result.output.nodes.find(n => n?.type === 'result') || 
                                 result.output.nodes[result.output.nodes.length - 1];
                if (resultNode?.outputs?.[0]?.content) {
                    return resultNode.outputs[0].content;
                }
            }
            
            if (Array.isArray(result?.data) && result.data.length) {
                const item = result.data[0];
                return item?.content || item?.message || item?.text || '';
            }
            
            if (result?.content || result?.message || result?.text) {
                return result.content || result.message || result.text;
            }
            
            // 返回格式化的JSON（截取前500字符）
            const jsonStr = JSON.stringify(result, null, 2);
            return jsonStr.slice(0, 500) + (jsonStr.length > 500 ? '...' : '');
            
        } catch (e) {
            console.warn('内容提取失败:', e);
            return '数据解析异常';
        }
    }

    function getCopyText() {
        const lines = [];
        if (els.resultContent?.textContent) {
            lines.push('处理结果:\n' + els.resultContent.textContent);
        }
        if (els.resultDebug?.textContent) {
            lines.push('调试链接:\n' + els.resultDebug.textContent);
        }
        return lines.join('\n\n');
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();

// 粒子背景效果
(function initParticles() {
    const canvas = document.getElementById('particleCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const particles = [];
    
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    function createParticle() {
        return {
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() - 0.5) * 0.5,
            size: Math.random() * 2 + 1,
            opacity: Math.random() * 0.5 + 0.2
        };
    }
    
    function updateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
            if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;
            
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 212, 255, ${particle.opacity})`;
            ctx.fill();
        });
        
        requestAnimationFrame(updateParticles);
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // 创建粒子
    for (let i = 0; i < 50; i++) {
        particles.push(createParticle());
    }
    
    updateParticles();
})();