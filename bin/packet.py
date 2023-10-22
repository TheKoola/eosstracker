##################################################
#    This file is part of the HABTracker project for tracking high altitude balloons.
#
#    Copyright (C) 2023 Jeff Deaton (N6BA)
#
#    HABTracker is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    HABTracker is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with HABTracker.  If not, see <https://www.gnu.org/licenses/>.
#
##################################################

from dataclasses import dataclass, field

##################################    
# the Packet class
##################################    
@dataclass
class Packet:
    """
    Used for storing a packet
    """
    text: str
    frequency: int
    source: str
    properties: list = field(default_factory=list)

    def __post_init__(self)->None:
        if not self.properties:
            self.properties = []

    @property
    def bytestring(self):
        return self.text.encode(encoding='utf-8', errors='ignore')

    def __bytes__(self):
        # bytes representation of the packet object
        return self.text.encode(encoding = 'utf-8', errors = 'ignore')

    def __str__(self):
        # string representation of theh packet object 
        return self.text
