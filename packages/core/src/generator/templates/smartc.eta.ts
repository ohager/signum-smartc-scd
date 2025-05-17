export const SmartCTemplate =`#program name <%= it.contractName %>

#program description <%= it.description %>

#program activationAmount <%= it.activationAmount %>

<% Object.keys(it.pragmas).forEach(function(key) { %>
#pragma <%= key %> <%= it.pragmas[key] %>

<% }) %>

// Magic codes for methods
<% for (const m of it.methods) { %>
#define <%= m.name.toUpperCase() %> <%= m.code %>

<% } %>

// Maps
<% for (const map of it.maps) { %>
#define MAP_<%= map.name.toUpperCase() %>_<%= map.key1.name.toUpperCase() %> <%= map.key1.value %>

<% } %>


// State variables
<% for (const svar of it.variables) { %>
long <%= svar.name %>;
<% } %>


// Structs
<% for (const struct of it.structs) { %>
struct <%= struct.name.toUpperCase() %> {
    <% for (const field of struct.fields) { %>
    long <%= field.name %>;
    <% } %>
} <%= struct.name %>;
<% } %>

// basic tx iteration struct
struct TX {
    long txId;
    long sender;
    long message[4];
} currentTx;

void main() {
    while ((currentTx.txId = getNextTx()) != 0) {
        currentTx.sender = getSender(currentTx.txId);
        readMessage(currentTx.txId, 0, currentTx.message);

        switch(currentTx.message[0]) {
        <% for (const method of it.methods) { %>
            case <%= method.name.toUpperCase() %>:
                <%= method.name %>(<% for (let i = 0; i < method.args.length; i++) { %>currentTx.message[<%= i + 1 %>]<% if (i < method.args.length - 1) { %>, <% } } %>);
                break;
        <% } %>
        }
    }
}



// Function stubs
<% for (const method of it.methods) { %>
void <%= method.name %>(<% for (let i = 0; i < method.args.length; i++) { %>long <%= method.args[i].name %><% if (i < method.args.length - 1) { %>, <% } } %>) {
    // TODO: Implement <%= method.name %>

}
<% } %>
`
