'use client'

// src/hooks/useAuth.ts
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const ensureProfile = useCallback(async (user: User) => {
    const username = user.user_metadata?.user_name
      || user.user_metadata?.name
      || user.email?.split('@')[0]
      || 'Player'

    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username }, { onConflict: 'id', ignoreDuplicates: true })

    if (error) console.error('Profile upsert error:', error)
  }, [])

  useEffect(() => {
    if (user) ensureProfile(user)
  }, [user, ensureProfile])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
  }

  const signInWithGithub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return { user, loading, signInWithGoogle, signInWithGithub, signOut }
}
