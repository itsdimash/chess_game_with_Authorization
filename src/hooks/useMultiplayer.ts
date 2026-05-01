// src/hooks/useMultiplayer.ts
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGameStore } from '@/store/gameStore'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Color } from '@/types'
import toast from 'react-hot-toast'

interface MultiplayerState {
  gameId: string | null
  isConnected: boolean
  isWaiting: boolean
  opponentId: string | null
  playerColor: Color | null
  inviteLink: string | null
}

interface GameMoveEvent {
  from: string
  to: string
  promotion?: string
  fen: string
  san: string
  moveNumber: number
}

interface PlayerEvent {
  type: 'join' | 'leave' | 'resign' | 'draw_offer' | 'draw_accept'
  playerId: string
  username: string
}

export function useMultiplayer() {
  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)
  const { makeMove, setOpponentOnline, chess } = useGameStore()

  const [state, setState] = useState<MultiplayerState>({
    gameId: null,
    isConnected: false,
    isWaiting: false,
    opponentId: null,
    playerColor: null,
    inviteLink: null,
  })

  // Create a new game and wait for opponent
  const createGame = useCallback(async (timeControl: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Please sign in to play multiplayer'); return null }

    // Insert game record
    const { data: game, error } = await supabase
      .from('games')
      .insert({
        white_player_id: user.id,
        status: 'waiting',
        time_control: timeControl,
        pgn: '',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        white_time_remaining: getTimeSeconds(timeControl),
        black_time_remaining: getTimeSeconds(timeControl),
        move_count: 0,
      })
      .select()
      .single()

    if (error || !game) { toast.error('Failed to create game'); return null }

    const inviteLink = `${window.location.origin}/game/${game.id}`

    setState(prev => ({
      ...prev,
      gameId: game.id,
      playerColor: 'w',
      isWaiting: true,
      inviteLink,
    }))

    // Subscribe to the game channel
    subscribeToGame(game.id, 'w')
    return { gameId: game.id, inviteLink }
  }, [supabase])

  // Join an existing game
  const joinGame = useCallback(async (gameId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error('Please sign in to play'); return false }

    // Fetch game
    const { data: game, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .eq('status', 'waiting')
      .single()

    if (error || !game) { toast.error('Game not found or already started'); return false }
    if (game.white_player_id === user.id) { toast.error('Cannot join your own game'); return false }

    // Update game with black player
    const { error: updateError } = await supabase
      .from('games')
      .update({
        black_player_id: user.id,
        status: 'active',
      })
      .eq('id', gameId)

    if (updateError) { toast.error('Failed to join game'); return false }

    setState(prev => ({
      ...prev,
      gameId,
      playerColor: 'b',
      isWaiting: false,
      opponentId: game.white_player_id,
    }))

    // Subscribe and announce join
    subscribeToGame(gameId, 'b')

    // Broadcast join event
    channelRef.current?.send({
      type: 'broadcast',
      event: 'player_event',
      payload: {
        type: 'join',
        playerId: user.id,
        username: user.email?.split('@')[0] ?? 'Opponent',
      } as PlayerEvent,
    })

    return true
  }, [supabase])

  // Subscribe to realtime game channel
  const subscribeToGame = useCallback((gameId: string, color: Color) => {
    // Clean up existing subscription
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase.channel(`game:${gameId}`, {
      config: {
        broadcast: { self: false },
        presence: { key: color },
      },
    })

    // Listen for moves
    channel.on('broadcast', { event: 'move' }, ({ payload }: { payload: GameMoveEvent }) => {
      // Apply opponent's move to board
      const success = makeMove(payload.from as any, payload.to as any, payload.promotion)
      if (!success) {
        console.error('Failed to apply opponent move:', payload)
        // Sync by loading FEN
        const { chess } = useGameStore.getState()
        chess.load(payload.fen)
      }
    })

    // Listen for player events
    channel.on('broadcast', { event: 'player_event' }, ({ payload }: { payload: PlayerEvent }) => {
      if (payload.type === 'join') {
        setState(prev => ({ ...prev, opponentId: payload.playerId, isWaiting: false }))
        setOpponentOnline(true)
        toast.success(`${payload.username} joined the game!`)
      } else if (payload.type === 'leave' || payload.type === 'resign') {
        setOpponentOnline(false)
        toast(`${payload.username} ${payload.type === 'resign' ? 'resigned' : 'left'}`, { icon: '🏳️' })
      } else if (payload.type === 'draw_offer') {
        toast((t) => (
          <div>
            <p>{payload.username} offers a draw</p>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <button onClick={() => { sendPlayerEvent('draw_accept'); toast.dismiss(t.id) }}>Accept</button>
              <button onClick={() => toast.dismiss(t.id)}>Decline</button>
            </div>
          </div>
        ), { duration: 10000 })
      }
    })

    // Presence for online status
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const opponentPresent = Object.keys(state).some(k => k !== color)
      setOpponentOnline(opponentPresent)
    })

    channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      setOpponentOnline(true)
    })

    channel.on('presence', { event: 'leave' }, () => {
      setOpponentOnline(false)
    })

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setState(prev => ({ ...prev, isConnected: true }))
        await channel.track({ color, online: true })
      }
    })

    channelRef.current = channel
  }, [supabase, makeMove, setOpponentOnline])

  // Send a move to opponent
  const sendMove = useCallback(async (
    from: string,
    to: string,
    promotion?: string,
    fen?: string,
    san?: string,
    moveNumber?: number
  ) => {
    if (!channelRef.current) return

    channelRef.current.send({
      type: 'broadcast',
      event: 'move',
      payload: { from, to, promotion, fen, san, moveNumber } as GameMoveEvent,
    })

    // Also persist to database
    if (state.gameId) {
      await supabase.from('game_moves').insert({
        game_id: state.gameId,
        move_number: moveNumber ?? 0,
        san: san ?? '',
        fen_after: fen ?? '',
      })

      // Update game FEN
      await supabase
        .from('games')
        .update({ fen, pgn: chess.pgn(), move_count: moveNumber ?? 0 })
        .eq('id', state.gameId)
    }
  }, [state.gameId, supabase, chess])

  const sendPlayerEvent = useCallback(async (type: PlayerEvent['type']) => {
    if (!channelRef.current) return
    const { data: { user } } = await supabase.auth.getUser()
    channelRef.current.send({
      type: 'broadcast',
      event: 'player_event',
      payload: {
        type,
        playerId: user?.id ?? '',
        username: user?.email?.split('@')[0] ?? 'Player',
      } as PlayerEvent,
    })
  }, [supabase])

  const resign = useCallback(() => sendPlayerEvent('resign'), [sendPlayerEvent])
  const offerDraw = useCallback(() => sendPlayerEvent('draw_offer'), [sendPlayerEvent])

  const copyInviteLink = useCallback(() => {
    if (state.inviteLink) {
      navigator.clipboard.writeText(state.inviteLink)
      toast.success('Invite link copied!')
    }
  }, [state.inviteLink])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        sendPlayerEvent('leave')
        supabase.removeChannel(channelRef.current)
      }
    }
  }, [supabase, sendPlayerEvent])

  return {
    ...state,
    createGame,
    joinGame,
    sendMove,
    resign,
    offerDraw,
    copyInviteLink,
  }
}

function getTimeSeconds(timeControl: string): number {
  const map: Record<string, number> = {
    '1+0': 60, '3+0': 180, '5+0': 300,
    '10+0': 600, '15+10': 900, '30+0': 1800,
  }
  return map[timeControl] ?? 600
}
