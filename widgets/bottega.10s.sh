#!/bin/sh
# Bottega in the macOS menu bar, for SwiftBar or xbar (ADR-0015).
# Link or copy this file into your plugin folder; the name sets the refresh (10 s).
#
# <xbar.title>Bottega</xbar.title>
# <xbar.version>1.0</xbar.version>
# <xbar.author>Giordano Scalzo</xbar.author>
# <xbar.desc>Who is at work, who is waiting for you.</xbar.desc>
# <xbar.dependencies>node</xbar.dependencies>
# <swiftbar.hideAbout>true</swiftbar.hideAbout>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
exec "$HOME/.bottega/bin/bottega" status --swiftbar
