package com.lumen.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LumenDiscoveryTest {
    @Test
    fun parsesOnlyValidDiscoveryReplies() {
        assertEquals("http://192.168.1.9:3000/", LumenDiscovery.parseReply("lumen:192.168.1.9:3000"))
        assertNull(LumenDiscovery.parseReply("lumen:999.168.1.9:3000"))
        assertNull(LumenDiscovery.parseReply("lumen:192.168.1.9:0"))
        assertNull(LumenDiscovery.parseReply("lumen:192.168.1.9:65536"))
        assertNull(LumenDiscovery.parseReply("other:192.168.1.9:3000"))
    }

    @Test
    fun healthContractIsStrict() {
        assertEquals("http://192.168.1.9:3000/health", LumenDiscovery.healthUrl("http://192.168.1.9:3000/"))
        assertNull(LumenDiscovery.healthUrl("http://192.168.1.9:3000/private"))
        assertTrue(LumenDiscovery.isLumenHealth(200, "{\"ok\":true,\"service\":\"Lumen\"}"))
        assertFalse(LumenDiscovery.isLumenHealth(200, "{\"ok\":true,\"service\":\"Other\"}"))
        assertFalse(LumenDiscovery.isLumenHealth(401, "{\"ok\":true,\"service\":\"Lumen\"}"))
    }

    @Test
    fun healthPatternEscapesClosingObjectBraceForAndroidIcu() {
        val field = LumenDiscovery::class.java.getDeclaredField("healthPattern").apply {
            isAccessible = true
        }
        val pattern = (field.get(LumenDiscovery) as Regex).pattern

        assertTrue("Android ICU requires the closing object brace to be escaped", pattern.contains("\\}"))
    }
}
