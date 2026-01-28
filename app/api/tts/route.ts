
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const text = searchParams.get('text');
    
    if (!text) {
        return NextResponse.json({ error: 'Text parameter is required' }, { status: 400 });
    }

    const encodedText = encodeURIComponent(text);
    
    // Strategy 1: StreamElements (High Quality)
    try {
        const response = await fetch(`https://api.streamelements.com/kappa/v2/speech?voice=Vitoria&text=${encodedText}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (response.ok) {
            const audioBuffer = await response.arrayBuffer();
            return new NextResponse(audioBuffer, {
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                }
            });
        }
    } catch (error) {
        console.error('StreamElements TTS failed:', error);
    }

    // Strategy 2: Google TTS (Fallback)
    try {
        const response = await fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=gtx&tl=pt-BR&q=${encodedText}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (response.ok) {
            const audioBuffer = await response.arrayBuffer();
            return new NextResponse(audioBuffer, {
                headers: {
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-cache'
                }
            });
        }
    } catch (error) {
        console.error('Google TTS failed:', error);
    }

    return NextResponse.json({ error: 'Failed to generate TTS' }, { status: 500 });
}
