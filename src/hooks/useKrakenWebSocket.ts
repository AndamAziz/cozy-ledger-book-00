import { useEffect, useRef, useCallback, useState } from 'react';
import { TRACKED_PAIRS } from '@/lib/krakenApi';

interface TickerUpdate {
  pair: string;
  price: number;
  volume: number;
  change24h: number;
  high24h: number;
  low24h: number;
}

interface OHLCUpdate {
  pair: string;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface UseKrakenWebSocketOptions {
  onTickerUpdate?: (update: TickerUpdate) => void;
  onOHLCUpdate?: (update: OHLCUpdate) => void;
  ohlcPair?: string;
  ohlcInterval?: number;
}

export function useKrakenWebSocket({ onTickerUpdate, onOHLCUpdate, ohlcPair, ohlcInterval }: UseKrakenWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const onTickerRef = useRef(onTickerUpdate);
  const onOHLCRef = useRef(onOHLCUpdate);
  const ohlcPairRef = useRef(ohlcPair);
  const ohlcIntervalRef = useRef(ohlcInterval);

  onTickerRef.current = onTickerUpdate;
  onOHLCRef.current = onOHLCUpdate;
  ohlcPairRef.current = ohlcPair;
  ohlcIntervalRef.current = ohlcInterval;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    const ws = new WebSocket('wss://ws.kraken.com');
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);

      // Subscribe to ticker for all tracked pairs
      ws.send(JSON.stringify({
        event: 'subscribe',
        pair: TRACKED_PAIRS,
        subscription: { name: 'ticker' },
      }));

      // Subscribe to OHLC for the selected pair
      if (ohlcPairRef.current && ohlcIntervalRef.current) {
        ws.send(JSON.stringify({
          event: 'subscribe',
          pair: [ohlcPairRef.current],
          subscription: { name: 'ohlc', interval: ohlcIntervalRef.current },
        }));
      }
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      // Skip system messages
      if (data.event) return;

      // Array format: [channelID, data, channelName, pair]
      if (!Array.isArray(data)) return;

      const channelName = data[data.length - 2];
      const pair = data[data.length - 1];

      if (channelName === 'ticker' && onTickerRef.current) {
        const ticker = data[1];
        const lastPrice = parseFloat(ticker.c[0]);
        const openPrice = parseFloat(ticker.o[0]);
        const change = openPrice > 0 ? ((lastPrice - openPrice) / openPrice) * 100 : 0;

        onTickerRef.current({
          pair,
          price: lastPrice,
          volume: parseFloat(ticker.v[1]),
          change24h: change,
          high24h: parseFloat(ticker.h[1]),
          low24h: parseFloat(ticker.l[1]),
        });
      }

      if (typeof channelName === 'string' && channelName.startsWith('ohlc') && onOHLCRef.current) {
        const ohlc = data[1];
        onOHLCRef.current({
          pair,
          time: parseFloat(ohlc[0]),
          open: parseFloat(ohlc[2]),
          high: parseFloat(ohlc[3]),
          low: parseFloat(ohlc[4]),
          close: parseFloat(ohlc[5]),
          volume: parseFloat(ohlc[7]),
        });
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  // Initial connection
  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // Resubscribe OHLC when pair or interval changes
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    if (ohlcPair && ohlcInterval) {
      // Unsubscribe from previous (best effort)
      // Subscribe to new
      ws.send(JSON.stringify({
        event: 'subscribe',
        pair: [ohlcPair],
        subscription: { name: 'ohlc', interval: ohlcInterval },
      }));
    }
  }, [ohlcPair, ohlcInterval]);

  return { isConnected };
}
