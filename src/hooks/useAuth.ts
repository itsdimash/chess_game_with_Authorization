'use client'

// src/hooks/useAuth.ts
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/supabase'
import type { User } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    // On mount, check for an existing session
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (isMounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      } catch (error) {
        console.error('Session check error:', error)
        if (isMounted) setLoading(false)
      }
    }

    checkSession()

    // Listen for auth state changes (sign in, sign out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (isMounted) {
          setUser(session?.user ?? null)
          setLoading(false)
        }
      }
    )

    return () => {
      isMounted = false
      subscription?.unsubscribe()
    }
  }, [])

  const ensureProfile = useCallback(async (user: User) => {
    const username =
      user.user_metadata?.user_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Player'

    const { error } = await supabase.from('profiles').upsert(
      { id: user.id, username },
      { onConflict: 'id' }
    )

    if (error) console.error('Profile upsert error:', error)
  }, [])

  useEffect(() => {
    if (user) ensureProfile(user)
  }, [user, ensureProfile])

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const signInWithGithub = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return { user, loading, signInWithGoogle, signInWithGithub, signOut }
}
