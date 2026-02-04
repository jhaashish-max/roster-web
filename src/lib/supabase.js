import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ioupmkzhoqndbbkltevc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvdXBta3pob3FuZGJia2x0ZXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzNDY1NTcsImV4cCI6MjA4NDkyMjU1N30.wP-UPJ4i28xBLIoEnbexwSeLIehnfLmrnkpTm9br4DA'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Fetch roster for a specific month/year
export async function fetchRoster(year, month, team = 'Enterprise-VAS') {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data, error } = await supabase
        .from('roster')
        .select('*')
        .eq('team', team)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date')
        .order('name')

    if (error) {
        console.error('Error fetching roster:', error)
        return []
    }

    // Transform to expected format
    return data.map(row => ({
        Date: row.date,
        Name: row.name,
        Status: row.status,
        Team: row.team
    }))
}

// Fetch roster for ALL teams for a specific month/year
export async function fetchAllTeamsRoster(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { data, error } = await supabase
        .from('roster')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('team')
        .order('date')
        .order('name')

    if (error) {
        console.error('Error fetching all teams roster:', error)
        return {}
    }

    // Group by team
    const groupedData = {}
    data.forEach(row => {
        if (!groupedData[row.team]) {
            groupedData[row.team] = []
        }
        groupedData[row.team].push({
            Date: row.date,
            Name: row.name,
            Status: row.status,
            Team: row.team
        })
    })

    return groupedData
}

// Check if roster exists for a month
export async function checkRosterExists(year, month, team = 'Enterprise-VAS') {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`

    const { data, error } = await supabase
        .from('roster')
        .select('id')
        .eq('team', team)
        .gte('date', startDate)
        .limit(1)

    if (error) {
        console.error('Error checking roster:', error)
        return false
    }

    return data.length > 0
}

// Delete roster for a month
export async function deleteRoster(year, month, team = 'Enterprise-VAS') {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`

    const { error } = await supabase
        .from('roster')
        .delete()
        .eq('team', team)
        .gte('date', startDate)
        .lte('date', endDate)

    if (error) {
        console.error('Error deleting roster:', error)
        return false
    }

    return true
}

// Update a single roster entry
export async function updateRosterEntry(date, name, status, team = 'Enterprise-VAS') {
    const { error } = await supabase
        .from('roster')
        .upsert({
            date,
            name,
            status,
            team,
            month: new Date(date).getMonth() + 1,
            year: new Date(date).getFullYear()
        }, {
            onConflict: 'date,name,team'
        })

    if (error) {
        console.error('Error updating roster entry:', error)
        return false
    }

    return true
}

// ==================== TEAM CRUD FUNCTIONS ====================

// Fetch all teams
export async function getTeams() {
    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name')

    if (error) {
        console.error('Error fetching teams:', error)
        return []
    }

    return data
}

// Get a single team by ID
export async function getTeamById(id) {
    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', id)
        .single()

    if (error) {
        console.error('Error fetching team:', error)
        return null
    }

    return data
}

// Get a single team by name
export async function getTeamByName(name) {
    const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('name', name)
        .single()

    if (error) {
        console.error('Error fetching team:', error)
        return null
    }

    return data
}

// Create a new team
export async function createTeam(name, members, customPrompt = null) {
    const { data, error } = await supabase
        .from('teams')
        .insert({
            name,
            members,
            custom_prompt: customPrompt
        })
        .select()
        .single()

    if (error) {
        console.error('Error creating team:', error)
        return null
    }

    return data
}

// Update an existing team
export async function updateTeam(id, updates) {
    const { data, error } = await supabase
        .from('teams')
        .update({
            ...updates,
            custom_prompt: updates.customPrompt !== undefined ? updates.customPrompt : updates.custom_prompt
        })
        .eq('id', id)
        .select()
        .single()

    if (error) {
        console.error('Error updating team:', error)
        return null
    }

    return data
}

// Delete a team
export async function deleteTeam(id) {
    const { error } = await supabase
        .from('teams')
        .delete()
        .eq('id', id)

    if (error) {
        console.error('Error deleting team:', error)
        return false
    }

    return true
}
