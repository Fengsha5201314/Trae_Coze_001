#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Coze API 代理服务器
解决浏览器CORS跨域问题
"""

import json
import asyncio
import aiohttp
from aiohttp import web, ClientSession
from aiohttp.web_response import StreamResponse
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Coze API 基础URL
COZE_BASE_URL = "https://api.coze.cn"

async def proxy_handler(request):
    """代理处理器 - 转发请求到Coze API"""
    try:
        # 构建目标URL
        path = request.match_info.get('path', '')
        target_url = f"{COZE_BASE_URL}/{path}"
        
        # 获取请求头，过滤掉一些浏览器特有的头
        headers = {}
        for key, value in request.headers.items():
            if key.lower() not in ['host', 'origin', 'referer']:
                headers[key] = value
        
        # 获取请求体
        body = None
        if request.method in ['POST', 'PUT', 'PATCH']:
            body = await request.read()
        
        logger.info(f"代理请求: {request.method} {target_url}")
        
        # 创建HTTP客户端会话
        async with ClientSession() as session:
            # 发送请求到Coze API
            async with session.request(
                method=request.method,
                url=target_url,
                headers=headers,
                data=body,
                params=request.query
            ) as resp:
                
                # 检查是否为SSE流
                content_type = resp.headers.get('content-type', '')
                if 'text/event-stream' in content_type:
                    return await handle_sse_stream(resp, request)
                else:
                    return await handle_regular_response(resp)
                    
    except Exception as e:
        logger.error(f"代理错误: {str(e)}")
        return web.json_response(
            {'error': f'代理服务器错误: {str(e)}'}, 
            status=500,
            headers={'Access-Control-Allow-Origin': '*'}
        )

async def handle_sse_stream(coze_response, original_request):
    """处理SSE流响应"""
    # 创建流响应
    response = StreamResponse(
        status=coze_response.status,
        headers={
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': '*'
        }
    )
    
    await response.prepare(original_request)
    
    try:
        # 逐块读取并转发SSE数据
        async for chunk in coze_response.content.iter_chunked(1024):
            if chunk:
                await response.write(chunk)
                await response.drain()
    except Exception as e:
        logger.error(f"SSE流处理错误: {str(e)}")
    finally:
        await response.write_eof()
    
    return response

async def handle_regular_response(coze_response):
    """处理普通响应"""
    # 读取响应内容
    content = await coze_response.read()
    
    # 构建响应头，添加CORS支持
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': '*'
    }
    
    # 复制原始响应头（除了一些特殊的）
    for key, value in coze_response.headers.items():
        if key.lower() not in ['transfer-encoding', 'connection']:
            headers[key] = value
    
    return web.Response(
        body=content,
        status=coze_response.status,
        headers=headers
    )

async def options_handler(request):
    """处理OPTIONS预检请求"""
    return web.Response(
        headers={
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Max-Age': '86400'
        }
    )

async def health_check(request):
    """健康检查端点"""
    return web.json_response(
        {'status': 'ok', 'message': 'Coze代理服务器运行正常'},
        headers={'Access-Control-Allow-Origin': '*'}
    )

def create_app():
    """创建应用"""
    app = web.Application()
    
    # 添加路由
    app.router.add_route('OPTIONS', '/{path:.*}', options_handler)
    app.router.add_route('*', '/health', health_check)
    app.router.add_route('*', '/{path:.*}', proxy_handler)
    
    return app

if __name__ == '__main__':
    app = create_app()
    
    print("\n🚀 Coze API 代理服务器启动中...")
    print("📍 代理地址: http://localhost:8001")
    print("🎯 目标API: https://api.coze.cn")
    print("✅ CORS支持: 已启用")
    print("📡 SSE流式: 已支持")
    print("\n💡 使用方法:")
    print("   前端请求: http://localhost:8001/v1/workflow/stream_run")
    print("   实际转发: https://api.coze.cn/v1/workflow/stream_run")
    print("\n按 Ctrl+C 停止服务器\n")
    
    try:
        web.run_app(app, host='localhost', port=8001)
    except KeyboardInterrupt:
        print("\n👋 代理服务器已停止")
